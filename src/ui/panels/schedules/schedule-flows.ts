import type { PreparedRun } from "../../../core/scheduler/manual-run.js";
import { upcomingRuns } from "../../../core/scheduler/model/recurrence.js";
import type { Schedule } from "../../../core/scheduler/model/types.js";
import type { SelectedPackage } from "../../../core/types.js";
import type { UpdateReport } from "../../../core/update/update-report.js";
import { formatRelative } from "../../text/fr-format.js";
import { NOTHING_TO_INSTALL } from "../../text/schedule/schedule-cli-labels.js";
import { NEVER_RAN, runStatusLabel } from "../../text/schedule/schedule-labels.js";
import {
  REMOVE_DIALOG,
  RUN_NOW_DIALOG,
  SCHEDULE_NOTICES,
} from "../../text/schedule/schedule-menu-labels.js";
import { seg } from "../../tui/styled-lines.js";
import type { FlowContext } from "./flow-context.js";
import { runStatusTone } from "./schedule-list-lines.js";
import type { ListHandlers } from "./schedules-panel.js";

/**
 * The Planification list's actions: switch a schedule on or off, delete it,
 * repair the OS trigger, run it now. "Run now" (amendment S-5) scans the
 * providers the schedule needs here, hands the outdated packages to the
 * menu's launcher — the run view, or the plain terminal — and records what
 * the launcher reports as the schedule's last run. When the update runs
 * outside the screen the launcher has no report to give: the run tracker
 * the scheduler module installs records it instead.
 */

export class ScheduleFlows implements ListHandlers {
  readonly #kit: FlowContext;
  #isRunning = false;

  constructor(kit: FlowContext) {
    this.#kit = kit;
  }

  shown(): void {
    const { port } = this.#kit;
    port.reload();
    port.markSeen();
    void this.#kit.refreshTrigger();
  }

  async toggle(schedule: Schedule): Promise<void> {
    const { port } = this.#kit;
    if (schedule.enabled) {
      await this.#kit.change(
        () => port.disable(schedule.id),
        (saved) => [seg(SCHEDULE_NOTICES.disabled(saved.name))],
      );
      return;
    }
    if (!(await this.#kit.consent())) return;
    await this.#kit.change(
      () => port.enable(schedule.id),
      (saved) => [seg(SCHEDULE_NOTICES.enabled(saved.name, this.#nextRun(saved)), "success")],
    );
  }

  async remove(schedule: Schedule): Promise<void> {
    const isConfirmed = await this.#kit.view.dialogs.confirm({
      title: REMOVE_DIALOG.title(schedule.name),
      text: [REMOVE_DIALOG.text],
      default: false,
    });
    if (!isConfirmed) return this.#kit.view.redraw();
    await this.#kit.change(
      () => this.#kit.port.remove(schedule.id),
      (removed) => [seg(SCHEDULE_NOTICES.removed(removed.name))],
    );
  }

  /** `i`: register the OS trigger again for this gup — never with nothing enabled. */
  async repairTrigger(): Promise<void> {
    const { port } = this.#kit;
    if (!port.snapshot().schedules.some((schedule) => schedule.enabled)) {
      return this.#kit.notify([[seg(NOTHING_TO_INSTALL, "warning")]]);
    }
    if (!(await this.#kit.consent())) return this.#kit.view.redraw();
    const sync = await port.repair();
    this.#kit.notify(this.#kit.syncLines(sync));
    void this.#kit.refreshTrigger();
  }

  async runNow(schedule: Schedule): Promise<void> {
    if (this.#isRunning) return this.#kit.notify([[seg(SCHEDULE_NOTICES.busy, "warning")]]);
    const providers = this.#providerNames(schedule);
    const isConfirmed = await this.#kit.view.dialogs.confirm({
      title: RUN_NOW_DIALOG.title(schedule.name),
      text: [RUN_NOW_DIALOG.text(providers, schedule.targets.length)],
    });
    if (!isConfirmed) return this.#kit.view.redraw();
    this.#isRunning = true;
    try {
      await this.#run(schedule, providers);
    } finally {
      this.#isRunning = false;
    }
  }

  async #run(schedule: Schedule, providers: readonly string[]): Promise<void> {
    const kit = this.#kit;
    kit.notify([[seg(SCHEDULE_NOTICES.scanning(providers), "muted")]]);
    const prepared = await kit.port.prepareRun(schedule.id);
    if (!kit.isLive) return;
    if ("error" in prepared) return kit.notify([[seg(prepared.error, "danger")]]);
    if (prepared.plan.updates.length === 0) return this.#record(prepared, null);
    kit.notify([]);
    const report = await kit.view.updates.launch(packagesOf(prepared), {
      scheduleId: schedule.id,
      returnTo: "schedules",
    });
    // Null: declined, or updating outside the screen, where the run tracker records it.
    if (report !== null && kit.isLive) this.#record(prepared, report);
  }

  #record(prepared: PreparedRun, report: UpdateReport | null): void {
    const record = this.#kit.port.recordRun(prepared, report);
    if (!record) return this.#kit.view.redraw();
    const text = SCHEDULE_NOTICES.ran(runStatusLabel(record));
    this.#kit.notify([[seg(text, runStatusTone(record.status))]]);
  }

  /** The providers a run of `schedule` scans, by name, each once. */
  #providerNames(schedule: Schedule): string[] {
    const ids = new Set(schedule.targets.map((target) => target.providerId));
    return [...ids].map((id) => this.#kit.port.providerName(id));
  }

  #nextRun(schedule: Schedule): string {
    const now = this.#kit.port.now();
    const [next] = upcomingRuns(schedule.recurrence, now, 1);
    return next ? formatRelative(next, now) : NEVER_RAN;
  }
}

/** The plan's packages as the launcher takes them: the scan's rows, never the stored ids. */
function packagesOf(prepared: PreparedRun): SelectedPackage[] {
  return prepared.plan.updates.map(({ providerId, pkg }) => ({ providerId, pkg }));
}
