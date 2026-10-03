import { log } from "../log/log.js";
import type { UpdateRequest } from "../update/update-ports.js";
import type { UpdateReport } from "../update/update-report.js";
import type { Schedule, ScheduleRunRecord, TickPlan } from "./model/types.js";
import { withScheduleState, type RunStateStore } from "./persistence/run-state.js";
import { summarizeRun } from "./run-summary.js";
import { requestsOf, type TargetResolver } from "./target-resolver.js";

/**
 * "Run now": a schedule's targets updated on request, whatever its
 * recurrence says. Same targeted scan and plan as a tick; the updates run
 * where the user watches (the terminal, the menu's run view), and the
 * result becomes the schedule's last run. The due anchor is left alone: a
 * manual run neither consumes nor postpones the next occurrence.
 *
 * The two halves are separate for the menu, which hands the updates to its
 * launcher between them: {@link ManualRun.prepare} scans and plans,
 * {@link ManualRun.settle} records what the updates did.
 */

/** Run the requests where the user watches; null when the run was declined. */
export type ManualExecutor = (requests: readonly UpdateRequest[]) => Promise<UpdateReport | null>;

export interface ManualRunDeps {
  readonly clock: () => Date;
  readonly resolver: Pick<TargetResolver, "resolve">;
  readonly state: Pick<RunStateStore, "update">;
}

/** A schedule scanned and planned, its updates not run yet. */
export interface PreparedRun {
  readonly schedule: Schedule;
  readonly plan: TickPlan;
  readonly startedAt: Date;
}

/** Planned but not attempted: the user stopped the run. */
export const MANUAL_STOP_MESSAGE = "arrêtée avant son tour";

export class ManualRun {
  readonly #deps: ManualRunDeps;

  constructor(deps: ManualRunDeps) {
    this.#deps = deps;
  }

  /** The run's record (also stored as the schedule's last run), or null when declined. */
  async run(schedule: Schedule, execute: ManualExecutor): Promise<ScheduleRunRecord | null> {
    const prepared = await this.prepare(schedule);
    if (prepared.plan.updates.length === 0) return this.settle(prepared, null);
    const report = await execute(requestsOf(prepared.plan));
    return report === null ? null : this.settle(prepared, report);
  }

  /** Scan the providers the schedule's targets need and plan its updates. */
  async prepare(schedule: Schedule): Promise<PreparedRun> {
    const startedAt = this.#deps.clock();
    return { schedule, plan: await this.#deps.resolver.resolve([schedule]), startedAt };
  }

  /**
   * Store what the prepared run did as the schedule's last run: `report`
   * holds the updates attempted so far (null: there was nothing to update);
   * a planned update it does not hold counts as stopped by the user.
   */
  settle(prepared: PreparedRun, report: UpdateReport | null): ScheduleRunRecord | null {
    const { schedule, plan, startedAt } = prepared;
    const records = summarizeRun([{ schedule, kind: "manual" }], {
      plan,
      report,
      startedAt,
      finishedAt: this.#deps.clock(),
      cancelledMessage: MANUAL_STOP_MESSAGE,
    });
    const record = records.get(schedule.id) ?? null;
    if (record) this.#remember(schedule.id, record);
    return record;
  }

  /** The updates happened: a state file that cannot be written costs a log line, not the run. */
  #remember(scheduleId: string, record: ScheduleRunRecord): void {
    try {
      this.#deps.state.update((state) =>
        withScheduleState(state, scheduleId, (entry) => ({ ...entry, lastRun: record })),
      );
    } catch (err) {
      log.warn("scheduler.state-write-failed", { scheduleId, error: String(err) });
    }
  }
}
