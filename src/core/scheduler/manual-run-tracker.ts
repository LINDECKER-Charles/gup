import type { BatchHolder } from "../update/update-extensions.js";
import type {
  Attempt,
  AttemptResult,
  OutcomeEntry,
  PlannedUpdate,
  UpdateObserver,
  UpdatePlan,
} from "../update/update-ports.js";
import { buildReport, entryOf, type UpdateReport } from "../update/update-report.js";
import type { PreparedRun } from "./manual-run.js";

/**
 * Records a "run now" started from the menu, wherever its updates end up
 * running. The in-screen run view hands its report back to the menu; an
 * update that runs outside the screen (no embedded terminal) only reaches
 * it through the pipeline's process-wide observers — this one, installed
 * for the menu by the scheduler's CLI module.
 *
 * Armed with the prepared run before the launch, it records the schedule's
 * last run after each attempt of that schedule; an update not attempted yet
 * counts as stopped, which is the truth if gup dies halfway through. A run
 * the user declined never sends an attempt, and records nothing.
 */

/** Store what a prepared run did so far (`ManualRun.settle`). */
export type SettleRun = (prepared: PreparedRun, report: UpdateReport) => void;

interface ArmedRun {
  readonly prepared: PreparedRun;
  /** Latest outcome per package key: a retry replaces the first attempt. */
  readonly entries: Map<string, OutcomeEntry>;
}

export class ManualRunTracker implements UpdateObserver {
  readonly #settle: SettleRun;
  readonly #armed = new Map<string, ArmedRun>();

  constructor(settle: SettleRun) {
    this.#settle = settle;
  }

  /** The prepared run's updates are about to be launched: record their attempts. */
  arm(prepared: PreparedRun): void {
    this.#armed.set(prepared.schedule.id, { prepared, entries: new Map() });
  }

  /** The schedule's run was recorded from its report: stop listening for it. */
  disarm(scheduleId: string): void {
    this.#armed.delete(scheduleId);
  }

  finished(result: AttemptResult): void {
    const armed = this.#armedFor(result.item);
    if (!armed) return;
    armed.entries.set(result.item.key, entryOf(result.item, result.outcome));
    this.#record(armed);
  }

  /** The batch stopped: what it never reached is recorded as stopped. */
  cancelled(items: readonly PlannedUpdate[]): void {
    const runs = new Set(items.map((item) => this.#armedFor(item)));
    for (const armed of runs) if (armed) this.#record(armed);
  }

  planned(_plan: UpdatePlan): void {}

  started(_attempt: Attempt): void {}

  elevationStarted(_items: readonly PlannedUpdate[]): void {}

  waiting(_holder: BatchHolder): void {}

  #armedFor(item: PlannedUpdate): ArmedRun | undefined {
    return item.scheduleId === undefined ? undefined : this.#armed.get(item.scheduleId);
  }

  #record(armed: ArmedRun): void {
    this.#settle(armed.prepared, buildReport([...armed.entries.values()], []));
  }
}
