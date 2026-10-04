import type { PreparedRun } from "../../../core/scheduler/manual-run.js";
import type {
  Schedule,
  ScheduleDraft,
  SchedulerState,
  ScheduleRunRecord,
} from "../../../core/scheduler/model/types.js";
import type { ValidationIssue } from "../../../core/scheduler/model/validate-schedule.js";
import type { Mechanism } from "../../../core/scheduler/trigger/os-trigger.js";
import type { TriggerHealth } from "../../../core/scheduler/trigger/trigger-health.js";
import type { SyncResult } from "../../../core/scheduler/trigger/trigger-sync.js";
import type { UpdateReport } from "../../../core/update/update-report.js";

/**
 * What the Schedules view needs from the scheduler. Implemented by
 * `commands/schedule/schedules-controller.ts` over this machine's files and
 * OS trigger; tests hand in a fake. Type-only module.
 *
 * Reads are cached and cheap — the sidebar badge and Packages' marks read
 * them at every frame — until `reload()`. Changes are async: each one
 * brings the OS trigger in line, as `gup schedule` does.
 */

/** The schedules and their last runs, as last read. */
export interface SchedulesSnapshot {
  readonly schedules: readonly Schedule[];
  readonly state: SchedulerState;
  /** Runs that finished later were not seen in the view yet; null: never opened. */
  readonly seenUntil: Date | null;
}

/** The OS trigger, as `gup schedule list` reports it. */
export interface TriggerSummary {
  readonly health: TriggerHealth;
  /** Null where this platform has no trigger. */
  readonly mechanism: Mechanism | null;
  /** Why this platform has no trigger. */
  readonly unsupported?: string;
}

/**
 * A change saved — the schedule as stored (as it was, for a removal) and
 * what the OS trigger did — or why nothing was saved.
 */
export type ChangeOutcome =
  | { readonly isSaved: true; readonly schedule: Schedule; readonly sync: SyncResult }
  | { readonly isSaved: false; readonly error: string };

/** The schedules themselves. */
export interface ScheduleBook {
  snapshot(): SchedulesSnapshot;
  /** Read the files again: another terminal or a scheduled run may have changed them. */
  reload(): void;
  /** Every run finished so far has been seen. */
  markSeen(): void;
  /** Every reason `draft` cannot be saved; `editedId` when it replaces that schedule. */
  validate(draft: ScheduleDraft, editedId?: string): readonly ValidationIssue[];
  create(draft: ScheduleDraft): Promise<ChangeOutcome>;
  replace(id: string, draft: ScheduleDraft): Promise<ChangeOutcome>;
  remove(id: string): Promise<ChangeOutcome>;
  enable(id: string): Promise<ChangeOutcome>;
  disable(id: string): Promise<ChangeOutcome>;
  providerName(providerId: string): string;
  now(): Date;
}

/** The OS trigger that runs them. */
export interface TriggerControl {
  trigger(): Promise<TriggerSummary>;
  /** The mechanism this machine registers; null where it has none. */
  mechanism(): Mechanism | null;
  /** Saving an enabled schedule now would register the OS trigger for the first time. */
  needsConsent(): boolean;
  /** Register the trigger again for this gup (`gup schedule install`). */
  repair(): Promise<SyncResult>;
}

/** "Run now" (amendment S-5): plan here, update through the menu's launcher, record here. */
export interface RunNowControl {
  /** Scan the providers the schedule needs and plan its updates. */
  prepareRun(id: string): Promise<PreparedRun | { readonly error: string }>;
  /** Store what the launch did (null: there was nothing to update) as the last run. */
  recordRun(prepared: PreparedRun, report: UpdateReport | null): ScheduleRunRecord | null;
}

export type SchedulesPort = ScheduleBook & TriggerControl & RunNowControl;
