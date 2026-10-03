import type {
  Mechanism,
  OsTrigger,
  TriggerRegistration,
  TriggerStatus,
} from "../../../src/core/scheduler/trigger/os-trigger.js";

/**
 * An OS trigger in memory: what was registered, which calls were made, and
 * an optional failure for install. Never touches Task Scheduler, launchd or
 * cron.
 */
export class FakeTrigger implements OsTrigger {
  readonly mechanism: Mechanism;
  installed: TriggerRegistration | null = null;
  isDisabledByUser = false;
  failure: string | null = null;
  readonly calls: string[] = [];

  constructor(mechanism: Mechanism = "crontab") {
    this.mechanism = mechanism;
  }

  async install(registration: TriggerRegistration): Promise<void> {
    this.calls.push("install");
    if (this.failure) throw new Error(this.failure);
    this.installed = registration;
  }

  async uninstall(): Promise<void> {
    this.calls.push("uninstall");
    if (this.failure) throw new Error(this.failure);
    this.installed = null;
  }

  async status(): Promise<TriggerStatus> {
    return { isInstalled: this.installed !== null, isDisabledByUser: this.isDisabledByUser };
  }

  async location(): Promise<string> {
    return "gup-scheduler-test";
  }
}
