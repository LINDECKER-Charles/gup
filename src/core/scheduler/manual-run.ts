import { log } from "../log/log.js";
import type { UpdateRequest } from "../update/update-ports.js";
import type { UpdateReport } from "../update/update-report.js";
import type { Schedule, ScheduleRunRecord } from "./model/types.js";
import { withScheduleState, type RunStateStore } from "./persistence/run-state.js";
import { summarizeRun } from "./run-summary.js";
import { requestsOf, type TargetResolver } from "./target-resolver.js";

/**
 * "Run now": a schedule's targets updated on request, whatever its
 * recurrence says. Same targeted scan and plan as a tick; the updates run
 * where the user watches (the terminal, the menu's run view), and the
 * result becomes the schedule's last run. The due anchor is left alone: a
 * manual run neither consumes nor postpones the next occurrence.
 */

/** Run the requests where the user watches; null when the run was declined. */
export type ManualExecutor = (requests: readonly UpdateRequest[]) => Promise<UpdateReport | null>;

export interface ManualRunDeps {
  readonly clock: () => Date;
  readonly resolver: Pick<TargetResolver, "resolve">;
  readonly state: Pick<RunStateStore, "update">;
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
    const startedAt = this.#deps.clock();
    const plan = await this.#deps.resolver.resolve([schedule]);
    const report = plan.updates.length > 0 ? await execute(requestsOf(plan)) : null;
    if (plan.updates.length > 0 && report === null) return null;
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
