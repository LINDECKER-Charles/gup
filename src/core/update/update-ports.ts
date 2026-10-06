import type { OutdatedPackage, UpdateOutcome } from "../types.js";
import type { BatchHolder } from "./update-extensions.js";

/**
 * The contracts between the update pipeline and whoever drives it: the CLI
 * console, the full-screen app's run view, a scheduled run. The pipeline
 * decides nothing a human should decide and prints nothing: it reports
 * through an {@link UpdateObserver}, asks through {@link UpdateDecisions} and
 * stops when its {@link AbortGate} says so.
 */

export type RetryStrategyId = "force" | "force-uninstall" | "reinstall";

/** One package the pipeline will attempt. */
export interface UpdateRequest {
  readonly providerId: string;
  readonly packageId: string;
  /** Scan entry (menu, picker, --all, schedule). Absent for `gup update provider:id`. */
  readonly pkg?: OutdatedPackage;
  /** The schedule this attempt belongs to, recorded in the history. */
  readonly scheduleId?: string;
}

export interface PlannedUpdate extends UpdateRequest {
  /** `providerId:packageId` — identity across retries and UI rows. */
  readonly key: string;
  readonly providerName: string;
}

export interface UpdatePlan {
  /** Run in-process, grouped by provider in first-appearance order. */
  readonly direct: readonly PlannedUpdate[];
  /** `pkg.requiresAdmin`: one elevation prompt for all of them, after `direct`. */
  readonly elevated: readonly PlannedUpdate[];
}

/** The latest outcome of one planned package. */
export interface OutcomeEntry {
  /** The {@link PlannedUpdate.key} it settles. */
  readonly key: string;
  readonly providerId: string;
  readonly outcome: UpdateOutcome;
}

export interface AbortGate {
  isAbortRequested(): boolean;
}

export interface Attempt {
  readonly item: PlannedUpdate;
  /** Set on a retry pass. */
  readonly retry?: RetryStrategyId;
}

export interface AttemptResult extends Attempt {
  readonly outcome: UpdateOutcome;
  /** Absent for elevated attempts (lost in the IPC round-trip, as in the history). */
  readonly durationMs?: number;
}

/**
 * What a UI (screen, console, log) hears. Every method is synchronous and
 * must not throw. `finished` may come without `started` for a package that
 * was never attempted: its provider is unknown or unsupported here, or it was
 * part of the elevated batch.
 */
export interface UpdateObserver {
  planned(plan: UpdatePlan): void;
  started(attempt: Attempt): void;
  finished(result: AttemptResult): void;
  elevationStarted(items: readonly PlannedUpdate[]): void;
  /** Planned but never attempted because the batch was stopped. */
  cancelled(items: readonly PlannedUpdate[]): void;
  /** Another gup run holds the update batch; this one waits for it to end. */
  waiting(holder: BatchHolder): void;
}

export interface RetryRequest {
  readonly failures: readonly PlannedUpdate[];
  /** Tiers still available, least aggressive first. */
  readonly strategies: readonly RetryStrategyId[];
}

/** Questions only a human (or a policy) answers. */
export interface UpdateDecisions {
  confirmElevation(count: number): Promise<boolean>;
  chooseRetry(request: RetryRequest): Promise<RetryStrategyId | null>;
  /** Message on the packages left out when confirmElevation() says no. */
  readonly declinedElevation?: string;
}

export interface UpdatePorts {
  readonly observer: UpdateObserver;
  readonly decisions: UpdateDecisions;
  readonly gate: AbortGate;
  /**
   * "interactive" (default) enters the batch guard before installing, so a
   * scheduled run and this one never drive package managers at once.
   * "scheduled" runs already hold it: the scheduler takes it before deciding
   * what is due.
   */
  readonly batch?: "interactive" | "scheduled";
}
