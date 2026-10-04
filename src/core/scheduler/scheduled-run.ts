import { log } from "../log/log.js";
import { isManualSkip, skippedAs } from "../update/finalize-outcome.js";
import type { BatchHolder } from "../update/update-extensions.js";
import type { AbortGate, UpdateRequest } from "../update/update-ports.js";
import { buildReport, type UpdateReport } from "../update/update-report.js";
import { evaluateDue } from "./model/due.js";
import { scheduleIssues, type ValidationIssue } from "./model/validate-schedule.js";
import { targetKey } from "./model/schedule-target.js";
import type {
  Schedule,
  SchedulerState,
  ScheduleRunRecord,
  ScheduleTarget,
  TickPlan,
} from "./model/types.js";
import { withoutOrphans, withScheduleState, type RunStateStore } from "./persistence/run-state.js";
import { summarizeRun, type ScheduleRun } from "./run-summary.js";
import { MAX_DEFERRALS, ON_TIME_GRACE_MS } from "./scheduler-timing.js";
import { requestsOf, type TargetResolver } from "./target-resolver.js";

/**
 * One tick of the scheduler: hold the update batch, decide what is due,
 * consume it before any work (a crash never loops on an occurrence), scan
 * only the providers the due targets need, update through the shared
 * pipeline, then record each schedule's results. Never waits for anyone: a
 * batch held by another gup run leaves every occurrence due for the next tick.
 */

export interface HeldBatch {
  release(): Promise<void>;
}

/** The update batch, taken for a scheduled run, or who holds it. */
export interface BatchAcquirer {
  tryAcquire(): Promise<HeldBatch | { readonly busy: BatchHolder | null }>;
}

/** Runs the planned updates through the pipeline, nobody watching. */
export type TickExecutor = (
  requests: readonly UpdateRequest[],
  gate: AbortGate,
) => Promise<UpdateReport>;

/** A target settled as skipped before any install, for the history. */
export interface SkippedTarget {
  readonly providerId: string;
  readonly packageId: string;
  readonly message: string;
  readonly scheduleId: string;
}

export interface ScheduledRunDeps {
  readonly clock: () => Date;
  readonly schedules: () => readonly Schedule[];
  readonly state: Pick<RunStateStore, "read" | "update">;
  readonly batch: BatchAcquirer;
  readonly resolver: Pick<TargetResolver, "resolve">;
  readonly execute: TickExecutor;
  readonly recordSkipped: (target: SkippedTarget) => void;
  /** Kill the install in flight (the runner's skip lever). */
  readonly interruptCurrent: () => void;
  /** No install starts after this long. */
  readonly deadlineMs: number;
}

export type TickOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "busy"; readonly holder: BatchHolder | null }
  | { readonly kind: "deferred" }
  | { readonly kind: "ran"; readonly records: ReadonlyMap<string, ScheduleRunRecord> };

export const SCHEDULED_RUN_MESSAGES = {
  deadline: "durée maximale d'exécution atteinte",
  stopped: "interrompu (arrêt du planificateur)",
  offline: "aucun provider n'a pu être interrogé (hors ligne ?)",
} as const;

const IDLE: TickOutcome = { kind: "idle" };

export class ScheduledRun {
  readonly #deps: ScheduledRunDeps;
  #isStopping = false;

  constructor(deps: ScheduledRunDeps) {
    this.#deps = deps;
  }

  async tick(): Promise<TickOutcome> {
    const enabled = this.#deps.schedules().filter((schedule) => schedule.enabled);
    if (enabled.length === 0) return IDLE;
    const now = this.#deps.clock();
    this.#deps.state.update((state) => ({ ...state, lastTickAt: now.toISOString() }));
    const { runnable, invalid } = checkStored(enabled, now);
    for (const refused of invalid) logInvalid(refused);
    if (runnable.length === 0) return IDLE;
    const batch = await this.#deps.batch.tryAcquire();
    if ("busy" in batch) {
      log.info("scheduler.tick-busy", { holder: batch.busy?.kind, pid: batch.busy?.pid });
      return { kind: "busy", holder: batch.busy };
    }
    try {
      return await this.#runDue(runnable, now);
    } finally {
      await batch.release();
    }
  }

  /** SIGTERM: kill the install in flight, start nothing else, record what happened. */
  stop(): void {
    this.#isStopping = true;
    this.#deps.interruptCurrent();
  }

  async #runDue(enabled: readonly Schedule[], now: Date): Promise<TickOutcome> {
    const due = this.#takeDue(enabled, now);
    if (due.length === 0) return IDLE;
    const before = this.#deps.state.read();
    this.#persist((state) => consume(state, { due, now }));
    const plan = await this.#deps.resolver.resolve(due.map((run) => run.schedule));
    if (plan.isEnvironmentDown) return this.#defer(due, { before, now });
    this.#recordSkipped(due, plan);
    const report = await this.#execute(plan, now);
    return this.#finish(due, { plan, report, startedAt: now });
  }

  /** The due schedules; missed occurrences are consumed and recorded on the way. */
  #takeDue(enabled: readonly Schedule[], now: Date): ScheduleRun[] {
    const state = this.#deps.state.read();
    const due: ScheduleRun[] = [];
    const missed: Schedule[] = [];
    for (const schedule of enabled) {
      const verdict = evaluateDue(
        { schedule, state: state.schedules[schedule.id], now },
        { onTimeGraceMs: ON_TIME_GRACE_MS },
      );
      if (verdict.kind === "due") due.push({ schedule, kind: verdict.runKind });
      if (verdict.kind === "missed") missed.push(schedule);
      if (verdict.kind !== "not-due") {
        log.info(`scheduler.${verdict.kind}`, { scheduleId: schedule.id, at: verdict.occurrence });
      }
    }
    if (missed.length > 0) this.#persist((current) => recordMissed(current, { missed, now }));
    return due;
  }

  /**
   * Every installed provider failed to scan — the machine likely woke before
   * its network. Give the occurrence back for the next tick, up to
   * {@link MAX_DEFERRALS} times, then report it failed.
   */
  #defer(due: readonly ScheduleRun[], at: { before: SchedulerState; now: Date }): TickOutcome {
    const exhausted = due.filter(
      (run) => (at.before.schedules[run.schedule.id]?.deferrals ?? 0) >= MAX_DEFERRALS,
    );
    const postponed = due.filter((run) => !exhausted.includes(run));
    this.#persist((state) => postpone(state, { postponed, before: at.before }));
    log.warn("scheduler.deferred", { postponed: postponed.length, failed: exhausted.length });
    if (exhausted.length === 0) return { kind: "deferred" };
    const plan = everyTargetFailed(exhausted, SCHEDULED_RUN_MESSAGES.offline);
    return this.#finish(exhausted, { plan, report: null, startedAt: at.now });
  }

  #recordSkipped(due: readonly ScheduleRun[], plan: TickPlan): void {
    const seen = new Set<string>();
    for (const { schedule } of due) {
      for (const target of schedule.targets) {
        const key = targetKey(target);
        const result = plan.resolved.get(key);
        if (result?.status !== "skipped" || seen.has(key)) continue;
        seen.add(key);
        const skipped = { ...pick(target), message: result.message ?? "", scheduleId: schedule.id };
        log.info("scheduler.target-skipped", skipped);
        this.#deps.recordSkipped(skipped);
      }
    }
  }

  async #execute(plan: TickPlan, now: Date): Promise<UpdateReport | null> {
    if (plan.updates.length === 0) return null;
    const deadline = now.getTime() + this.#deps.deadlineMs;
    const gate: AbortGate = {
      isAbortRequested: () => this.#isStopping || this.#deps.clock().getTime() >= deadline,
    };
    const report = await this.#deps.execute(requestsOf(plan), gate);
    return this.#isStopping ? asStopped(report) : report;
  }

  #finish(
    due: readonly ScheduleRun[],
    work: { plan: TickPlan; report: UpdateReport | null; startedAt: Date },
  ): TickOutcome {
    const records = summarizeRun(due, {
      ...work,
      finishedAt: this.#deps.clock(),
      cancelledMessage: this.#isStopping
        ? SCHEDULED_RUN_MESSAGES.stopped
        : SCHEDULED_RUN_MESSAGES.deadline,
    });
    const liveIds = new Set(this.#deps.schedules().map((schedule) => schedule.id));
    this.#persist((state) => withoutOrphans(recordRuns(state, records), liveIds));
    for (const [scheduleId, record] of records) {
      log.info("scheduler.run-finished", { scheduleId, kind: record.kind, status: record.status });
    }
    return { kind: "ran", records };
  }

  #persist(mutate: (state: SchedulerState) => SchedulerState): void {
    this.#deps.state.update(mutate);
  }
}

/** An enabled schedule the tick refuses to run, and why. */
interface InvalidSchedule {
  readonly schedule: Schedule;
  readonly issues: readonly ValidationIssue[];
}

/**
 * The schedules read from disk, checked again: one the editor and
 * `gup schedule` would refuse — `schedules.json` edited by hand to run every
 * minute — is never run. The heartbeat is written all the same, so the
 * trigger does not read as stopped.
 */
function checkStored(
  enabled: readonly Schedule[],
  now: Date,
): { readonly runnable: Schedule[]; readonly invalid: InvalidSchedule[] } {
  const runnable: Schedule[] = [];
  const invalid: InvalidSchedule[] = [];
  for (const schedule of enabled) {
    const issues = scheduleIssues(schedule, now);
    if (issues.length === 0) runnable.push(schedule);
    else invalid.push({ schedule, issues });
  }
  return { runnable, invalid };
}

/** Logged at every tick until the schedule is fixed or removed. */
function logInvalid({ schedule, issues }: InvalidSchedule): void {
  log.warn("scheduler.schedule-invalid", {
    scheduleId: schedule.id,
    issues: issues.map((issue) => `${issue.field}: ${issue.message}`),
  });
}

function pick(target: ScheduleTarget): Pick<ScheduleTarget, "providerId" | "packageId"> {
  return { providerId: target.providerId, packageId: target.packageId };
}

/** Consume the due occurrences before any work: lastAttemptAt = now. */
function consume(
  state: SchedulerState,
  at: { readonly due: readonly ScheduleRun[]; readonly now: Date },
): SchedulerState {
  const lastAttemptAt = at.now.toISOString();
  return at.due.reduce(
    (current, run) =>
      withScheduleState(current, run.schedule.id, (entry) => ({ ...entry, lastAttemptAt })),
    state,
  );
}

function recordMissed(
  state: SchedulerState,
  at: { readonly missed: readonly Schedule[]; readonly now: Date },
): SchedulerState {
  const stamp = at.now.toISOString();
  const lastRun: ScheduleRunRecord = {
    kind: "on-time",
    status: "missed",
    startedAt: stamp,
    finishedAt: stamp,
    targets: [],
  };
  return at.missed.reduce(
    (current, schedule) =>
      withScheduleState(current, schedule.id, (entry) => ({
        ...entry,
        lastAttemptAt: stamp,
        lastRun,
      })),
    state,
  );
}

/** Restore the anchor the deferred schedules had before this tick, one deferral more. */
function postpone(
  state: SchedulerState,
  deferral: { readonly postponed: readonly ScheduleRun[]; readonly before: SchedulerState },
): SchedulerState {
  return deferral.postponed.reduce((current, { schedule }) => {
    const previous = deferral.before.schedules[schedule.id] ?? {};
    return withScheduleState(current, schedule.id, (entry) => {
      const { lastAttemptAt: _consumed, ...rest } = entry;
      return {
        ...rest,
        ...(previous.lastAttemptAt !== undefined && { lastAttemptAt: previous.lastAttemptAt }),
        deferrals: (previous.deferrals ?? 0) + 1,
      };
    });
  }, state);
}

/** Store each record as its schedule's last run, deferrals cleared. */
function recordRuns(
  state: SchedulerState,
  records: ReadonlyMap<string, ScheduleRunRecord>,
): SchedulerState {
  let next = state;
  for (const [id, lastRun] of records) {
    next = withScheduleState(next, id, ({ deferrals: _cleared, ...entry }) => ({
      ...entry,
      lastRun,
    }));
  }
  return next;
}

function everyTargetFailed(runs: readonly ScheduleRun[], message: string): TickPlan {
  const keys = runs.flatMap(({ schedule }) => schedule.targets.map(targetKey));
  const failed = (key: string) => ({ target: key, status: "failed" as const, message });
  const resolved = new Map(keys.map((key) => [key, failed(key)]));
  return { updates: [], resolved, isEnvironmentDown: true };
}

/**
 * The install a stop interrupted reads "interrompu", not as a user's skip —
 * what its provider recovered still said after it.
 */
function asStopped(report: UpdateReport): UpdateReport {
  const entries = report.entries.map((entry) =>
    isManualSkip(entry.outcome)
      ? { ...entry, outcome: skippedAs(entry.outcome, SCHEDULED_RUN_MESSAGES.stopped) }
      : entry,
  );
  return buildReport(entries, report.cancelled);
}
