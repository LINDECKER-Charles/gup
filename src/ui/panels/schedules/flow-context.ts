import { log } from "../../../core/log/log.js";
import type { Schedule } from "../../../core/scheduler/model/types.js";
import type { SyncResult } from "../../../core/scheduler/trigger/trigger-sync.js";
import type { ViewContext } from "../../app/view-definition.js";
import { TRIGGER_REMOVED, triggerInstalledLine } from "../../text/schedule-cli-labels.js";
import { foreignInstallation } from "../../text/schedule-labels.js";
import {
  CONSENT_DIALOG,
  REPAIR_KEY,
  SCHEDULE_NOTICES,
} from "../../text/schedule-menu-labels.js";
import { seg, type Line } from "../../tui/styled-lines.js";
import type { SchedulesPanel } from "./schedules-panel.js";
import type { ChangeOutcome, SchedulesPort } from "./schedules-port.js";

/**
 * What the Planification flows share: the menu, the scheduler port, the
 * panel to report to, and the steps every change goes through — the
 * one-time consent before the OS trigger is first registered, the notice
 * saying what was saved and what the trigger did, the trigger line read
 * again.
 */
export class FlowContext {
  readonly view: ViewContext;
  readonly port: SchedulesPort;
  #panel: SchedulesPanel | null = null;

  constructor(view: ViewContext, port: SchedulesPort) {
    this.view = view;
    this.port = port;
  }

  /** The panel the flows report to, once built. */
  attach(panel: SchedulesPanel): void {
    this.#panel = panel;
  }

  get panel(): SchedulesPanel {
    if (!this.#panel) throw new Error("schedules: flows used before their panel exists");
    return this.#panel;
  }

  /** False once the session's screen is gone (the user quit while a flow waited). */
  get isLive(): boolean {
    return !this.view.screen.renderer.isDestroyed;
  }

  /** Show `lines` above the list or the form, now. */
  notify(lines: readonly Line[]): void {
    if (!this.isLive) return;
    this.panel.setNotice(lines);
    this.view.redraw();
  }

  /**
   * Before a change that leaves a schedule enabled: the user's consent to
   * register the OS trigger, asked once — when nothing is registered yet.
   */
  async consent(): Promise<boolean> {
    const mechanism = this.port.mechanism();
    if (mechanism === null || !this.port.needsConsent()) return true;
    return this.view.dialogs.confirm({
      title: CONSENT_DIALOG.title,
      text: CONSENT_DIALOG.text(mechanism),
    });
  }

  /** Run a change, then say what was saved (`describe`) and what the trigger did. */
  async change(
    run: () => Promise<ChangeOutcome>,
    describe: (schedule: Schedule) => Line,
  ): Promise<ChangeOutcome> {
    const outcome = await run();
    if (!outcome.isSaved) {
      this.notify([[seg(SCHEDULE_NOTICES.notSaved(outcome.error), "danger")]]);
      return outcome;
    }
    this.notify([describe(outcome.schedule), ...this.syncLines(outcome.sync)]);
    void this.refreshTrigger();
    return outcome;
  }

  /** What the OS trigger did after a change, in a line or none. */
  syncLines(sync: SyncResult): Line[] {
    const mechanism = this.port.mechanism();
    switch (sync.kind) {
      case "installed":
        return mechanism ? [[seg(triggerInstalledLine(mechanism), "muted")]] : [];
      case "removed":
        return [[seg(TRIGGER_REMOVED, "muted")]];
      case "foreign":
        return [[seg(foreignInstallation(sync.entry, REPAIR_KEY), "warning")]];
      case "failed":
        return [[seg(SCHEDULE_NOTICES.triggerFailed(sync.reason), "warning")]];
      case "unchanged":
        return [];
    }
  }

  /** Read the OS trigger's state again; the line keeps its last state if that fails. */
  async refreshTrigger(): Promise<void> {
    try {
      const trigger = await this.port.trigger();
      if (!this.isLive) return;
      this.panel.setTrigger(trigger);
      this.view.redraw();
    } catch (err) {
      log.warn("scheduler.trigger-status-failed", { error: String(err) });
    }
  }
}
