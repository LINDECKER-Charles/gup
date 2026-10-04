import type {
  Mechanism,
  OsTrigger,
  TriggerRegistration,
  TriggerStatus,
} from "../../../../src/core/scheduler/trigger/os-trigger.js";

/** What a screenshot says to a change of the OS trigger: never. */
const REFUSED = "a screenshot never changes the OS trigger";

/**
 * The fixture machine's Task Scheduler entry, as the scheduler sees it:
 * registered and enabled. It answers from memory — never schtasks — and
 * refuses any change, so a scene that would register or remove the real
 * trigger fails instead.
 */
export class FixtureTrigger implements OsTrigger {
  readonly mechanism: Mechanism = "windows-task";

  install(_registration: TriggerRegistration): Promise<void> {
    return Promise.reject(new Error(REFUSED));
  }

  uninstall(): Promise<void> {
    return Promise.reject(new Error(REFUSED));
  }

  status(): Promise<TriggerStatus> {
    return Promise.resolve({ isInstalled: true, isDisabledByUser: false });
  }

  location(): Promise<string> {
    return Promise.resolve("gup-scheduler-fixture");
  }
}
