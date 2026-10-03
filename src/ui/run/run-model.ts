import type { UpdateOutcome } from "../../core/types.js";
import { RETRY_TIERS } from "../../core/update/retry-pass.js";
import type { BatchHolder } from "../../core/update/update-extensions.js";
import type {
  Attempt,
  AttemptResult,
  PlannedUpdate,
  RetryStrategyId,
  UpdateObserver,
  UpdatePlan,
} from "../../core/update/update-ports.js";

/** Where one package of the run stands. */
export type ItemState =
  | "pending"
  | "running"
  | "elevating"
  | "succeeded"
  | "skipped"
  | "failed"
  | "cancelled";

/**
 * Where the run stands: before the plan, waiting for another gup run to
 * release the update batch, installing, inside the elevated step, or over.
 */
export type RunPhase = "starting" | "waiting" | "running" | "elevating" | "done";

/** One package as the run view shows it. Never mutated: every event replaces it. */
export interface RunItem {
  readonly key: string;
  readonly label: string;
  readonly providerName: string;
  readonly from?: string;
  readonly to?: string;
  /** Part of the elevated batch. */
  readonly isAdmin: boolean;
  readonly state: ItemState;
  /** Clock time of the current attempt's start. */
  readonly startedAt?: number;
  readonly durationMs?: number;
  /** The provider's message, or why the package never ran. */
  readonly message?: string;
  /** The failure may be retried with another strategy at the end of the batch. */
  readonly isRetryable?: boolean;
  /** Set while, and after, a retry pass replays the package. */
  readonly retry?: RetryStrategyId;
}

export interface RunCounts {
  /** Packages with a final state. */
  readonly done: number;
  readonly total: number;
  readonly succeeded: number;
  readonly skipped: number;
  readonly failed: number;
  readonly cancelled: number;
}

const SETTLED: ReadonlySet<ItemState> = new Set(["succeeded", "skipped", "failed", "cancelled"]);
const IN_FLIGHT: ReadonlySet<ItemState> = new Set(["running", "elevating"]);

/**
 * The state of one update run, fed by the pipeline as its observer: the
 * packages in plan order, what each one is doing or how it ended, the phase
 * of the run and its timing. Pure state: the run view draws it.
 */
export class RunModel implements UpdateObserver {
  readonly #clock: () => number;
  readonly #startedAt: number;
  #items: readonly RunItem[] = [];
  #phase: RunPhase = "starting";
  #holder: BatchHolder | null = null;
  #isStopping = false;
  #endedAt: number | null = null;

  constructor(clock: () => number = Date.now) {
    this.#clock = clock;
    this.#startedAt = clock();
  }

  get items(): readonly RunItem[] {
    return this.#items;
  }

  get phase(): RunPhase {
    return this.#phase;
  }

  /** Who holds the update batch while this run waits for it. */
  get holder(): BatchHolder | null {
    return this.#holder;
  }

  /** The user asked to stop: what is left will be cancelled. */
  get isStopping(): boolean {
    return this.#isStopping;
  }

  /** The package being installed (or the first of the elevated batch), if any. */
  get current(): RunItem | null {
    return this.#items.find((item) => IN_FLIGHT.has(item.state)) ?? null;
  }

  counts(): RunCounts {
    const count = (state: ItemState): number =>
      this.#items.filter((item) => item.state === state).length;
    return {
      done: this.#items.filter((item) => SETTLED.has(item.state)).length,
      total: this.#items.length,
      succeeded: count("succeeded"),
      skipped: count("skipped"),
      failed: count("failed"),
      cancelled: count("cancelled"),
    };
  }

  /** The package in flight, else the last one that ran (0 before any). */
  activeIndex(): number {
    const inFlight = this.#items.findIndex((item) => IN_FLIGHT.has(item.state));
    if (inFlight !== -1) return inFlight;
    return Math.max(0, this.#items.findLastIndex((item) => item.state !== "pending"));
  }

  /** Packages not started yet: what a stop would cancel. */
  remaining(): number {
    return this.#items.filter((item) => item.state === "pending").length;
  }

  elapsedMs(): number {
    return (this.#endedAt ?? this.#clock()) - this.#startedAt;
  }

  /** How long `item` took, or has been running; null when it never ran here. */
  durationOf(item: RunItem): number | null {
    if (item.durationMs !== undefined) return item.durationMs;
    if (item.state === "running" && item.startedAt !== undefined) {
      return this.#clock() - item.startedAt;
    }
    return null;
  }

  markStopping(): void {
    this.#isStopping = true;
  }

  markDone(): void {
    this.#phase = "done";
    this.#endedAt ??= this.#clock();
  }

  planned(plan: UpdatePlan): void {
    this.#items = [
      ...plan.direct.map((item) => itemOf(item, false)),
      ...plan.elevated.map((item) => itemOf(item, true)),
    ];
    this.#phase = "running";
  }

  started({ item, retry }: Attempt): void {
    this.#phase = "running";
    this.#holder = null;
    this.replace(item.key, (current) => ({
      ...withoutOutcome(current),
      state: "running",
      startedAt: this.#clock(),
      ...(retry !== undefined && { retry }),
    }));
  }

  finished({ item, outcome, durationMs }: AttemptResult): void {
    this.replace(item.key, (current) => ({
      ...withoutOutcome(current),
      state: stateOf(outcome),
      ...(durationMs !== undefined && { durationMs }),
      ...(outcome.message !== undefined && { message: outcome.message }),
      ...(isRetryableFailure(outcome) && { isRetryable: true }),
    }));
    if (this.#phase === "elevating" && !this.#items.some((i) => i.state === "elevating")) {
      this.#phase = "running";
    }
  }

  elevationStarted(items: readonly PlannedUpdate[]): void {
    this.#phase = "elevating";
    for (const { key } of items) {
      this.replace(key, (current) => ({ ...current, state: "elevating" }));
    }
  }

  cancelled(items: readonly PlannedUpdate[]): void {
    for (const { key } of items) {
      this.replace(key, (current) => ({ ...current, state: "cancelled" }));
    }
  }

  waiting(holder: BatchHolder): void {
    this.#phase = "waiting";
    this.#holder = holder;
  }

  private replace(key: string, change: (item: RunItem) => RunItem): void {
    this.#items = this.#items.map((item) => (item.key === key ? change(item) : item));
  }
}

/** How a retry pass is named: its history label ("retry --force"…). */
export function retryLabelOf(retry: RetryStrategyId): string {
  return RETRY_TIERS.find((tier) => tier.id === retry)?.historyLabel ?? retry;
}

/** How a package is named in the run: its display name when the scan gave one. */
export function labelOf(item: PlannedUpdate): string {
  return item.pkg?.name ?? item.packageId;
}

function itemOf(item: PlannedUpdate, isAdmin: boolean): RunItem {
  const { pkg } = item;
  return {
    key: item.key,
    label: labelOf(item),
    providerName: item.providerName,
    ...(pkg && { from: pkg.current, to: pkg.latest }),
    isAdmin,
    state: "pending",
  };
}

/** The item before an attempt: what a previous attempt left must not leak into this one. */
function withoutOutcome(item: RunItem): RunItem {
  const { durationMs: _duration, message: _message, isRetryable: _retryable, ...rest } = item;
  return rest;
}

function stateOf(outcome: UpdateOutcome): ItemState {
  if (outcome.success) return "succeeded";
  return outcome.skipped === true ? "skipped" : "failed";
}

function isRetryableFailure(outcome: UpdateOutcome): boolean {
  return !outcome.success && outcome.skipped !== true && outcome.retryable === true;
}
