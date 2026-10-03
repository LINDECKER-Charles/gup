import type { PreparedRun } from "../../../../src/core/scheduler/manual-run.js";
import { targetKey } from "../../../../src/core/scheduler/model/schedule-target.js";
import { summarizeRun } from "../../../../src/core/scheduler/run-summary.js";
import type {
  Schedule,
  ScheduleDraft,
  SchedulerState,
  ScheduleRunRecord,
} from "../../../../src/core/scheduler/model/types.js";
import { validateDraft } from "../../../../src/core/scheduler/model/validate-schedule.js";
import type { SyncResult } from "../../../../src/core/scheduler/trigger/trigger-sync.js";
import type { UpdateReport } from "../../../../src/core/update/update-report.js";
import type {
  ChangeOutcome,
  SchedulesPort,
  SchedulesSnapshot,
  TriggerSummary,
} from "../../../../src/ui/panels/schedules/schedules-port.js";
import { providerFacts } from "../../../core/scheduler/scheduler-fixtures.js";

/**
 * The scheduler as the Planification view sees it, in memory: schedules,
 * run state, an OS trigger that is "installed" by the first enabled
 * schedule, and a record of every call. Validation is the real one, over a
 * fake registry (Winget, npm (global), Chocolatey admin-only).
 */

// TZ=UTC in tests: local time is UTC.
export const NOW = new Date("2026-10-05T10:00:00Z");

export const PROVIDERS = providerFacts({
  winget: { displayName: "Winget" },
  "npm-g": { displayName: "npm (global)" },
  choco: { displayName: "Chocolatey", canUpdateUnattended: false },
});

const IDS = ["a1b2c3d4", "0badf00d", "cafe0001", "cafe0002"];

export class FakeSchedulesPort implements SchedulesPort {
  schedules: Schedule[] = [];
  state: SchedulerState = { v: 1, schedules: {} };
  seenUntil: Date | null = null;
  triggerSummary: TriggerSummary = { health: { kind: "none" }, mechanism: "windows-task" };
  isRegistered = false;
  /** What `prepareRun` answers; default: every target already up to date. */
  preparation: ((schedule: Schedule) => PreparedRun) | null = null;
  /** The changes asked for, in order: "create <id>", "repair"… */
  readonly calls: string[] = [];
  seenMarks = 0;
  readonly recorded: { prepared: PreparedRun; report: UpdateReport | null }[] = [];
  #snapshot: SchedulesSnapshot | null = null;

  snapshot(): SchedulesSnapshot {
    this.#snapshot ??= { schedules: [...this.schedules], state: this.state, seenUntil: this.seenUntil };
    return this.#snapshot;
  }

  reload(): void {
    this.#snapshot = null;
  }

  markSeen(): void {
    this.seenMarks++;
    this.seenUntil = NOW;
    this.#snapshot = null;
  }

  validate(draft: ScheduleDraft, editedId?: string) {
    const existingCount = this.schedules.filter((schedule) => schedule.id !== editedId).length;
    return validateDraft(draft, { now: NOW, providers: PROVIDERS, existingCount });
  }

  async create(draft: ScheduleDraft): Promise<ChangeOutcome> {
    const stamp = NOW.toISOString();
    const id = IDS[this.schedules.length] ?? "ffffffff";
    const schedule: Schedule = { ...draft, id, createdAt: stamp, armedAt: stamp };
    this.schedules.push(schedule);
    return this.#saved(`create ${id}`, schedule);
  }

  async replace(id: string, draft: ScheduleDraft): Promise<ChangeOutcome> {
    return this.#edit(`replace ${id}`, id, (schedule) => ({ ...schedule, ...draft }));
  }

  async remove(id: string): Promise<ChangeOutcome> {
    const removed = this.schedules.find((schedule) => schedule.id === id);
    this.schedules = this.schedules.filter((schedule) => schedule.id !== id);
    if (!removed) return { isSaved: false, error: "disparue" };
    return this.#saved(`remove ${id}`, removed);
  }

  async enable(id: string): Promise<ChangeOutcome> {
    return this.#edit(`enable ${id}`, id, (schedule) => ({ ...schedule, enabled: true }));
  }

  async disable(id: string): Promise<ChangeOutcome> {
    return this.#edit(`disable ${id}`, id, (schedule) => ({ ...schedule, enabled: false }));
  }

  providerName(providerId: string): string {
    const fact = PROVIDERS.lookup(providerId);
    return fact.isFound ? fact.displayName : providerId;
  }

  now(): Date {
    return NOW;
  }

  async trigger(): Promise<TriggerSummary> {
    return this.triggerSummary;
  }

  mechanism() {
    return this.triggerSummary.mechanism;
  }

  needsConsent(): boolean {
    return !this.isRegistered;
  }

  async repair(): Promise<SyncResult> {
    this.calls.push("repair");
    this.isRegistered = true;
    return { kind: "installed" };
  }

  async prepareRun(id: string): Promise<PreparedRun | { readonly error: string }> {
    this.calls.push(`prepare ${id}`);
    const schedule = this.schedules.find((candidate) => candidate.id === id);
    if (!schedule) return { error: "disparue" };
    const upToDate = schedule.targets.map((target) => {
      const key = targetKey(target);
      return [key, { target: key, status: "no-update" as const }] as const;
    });
    const nothing = { updates: [], resolved: new Map(upToDate), isEnvironmentDown: false };
    return this.preparation?.(schedule) ?? { schedule, plan: nothing, startedAt: NOW };
  }

  recordRun(prepared: PreparedRun, report: UpdateReport | null): ScheduleRunRecord | null {
    this.recorded.push({ prepared, report });
    const { schedule, plan } = prepared;
    const outcome = { plan, report, startedAt: NOW, finishedAt: NOW, cancelledMessage: "arrêt" };
    const record = summarizeRun([{ schedule, kind: "manual" }], outcome).get(schedule.id) ?? null;
    if (record) this.state = { ...this.state, schedules: { [schedule.id]: { lastRun: record } } };
    this.#snapshot = null;
    return record;
  }

  #edit(call: string, id: string, change: (schedule: Schedule) => Schedule): Promise<ChangeOutcome> {
    const found = this.schedules.find((schedule) => schedule.id === id);
    if (!found) return Promise.resolve({ isSaved: false, error: "disparue" });
    const changed = change(found);
    this.schedules = this.schedules.map((schedule) => (schedule.id === id ? changed : schedule));
    return Promise.resolve(this.#saved(call, changed));
  }

  #saved(call: string, schedule: Schedule): ChangeOutcome {
    this.calls.push(call);
    this.#snapshot = null;
    const hasEnabled = this.schedules.some((candidate) => candidate.enabled);
    const sync: SyncResult = this.#syncTo(hasEnabled);
    return { isSaved: true, schedule, sync };
  }

  /** The invariant "an enabled schedule ⇔ the trigger is registered". */
  #syncTo(hasEnabled: boolean): SyncResult {
    if (hasEnabled === this.isRegistered) return { kind: "unchanged" };
    this.isRegistered = hasEnabled;
    return { kind: hasEnabled ? "installed" : "removed" };
  }
}

/** A schedule as stored: daily 09:00 of `winget:Git.Git`, enabled. */
export function storedSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "a1b2c3d4",
    name: "Outils dev",
    recurrence: { kind: "daily", at: { hour: 9, minute: 0 } },
    targets: [{ providerId: "winget", packageId: "Git.Git" }],
    enabled: true,
    options: { catchUp: true },
    createdAt: "2026-09-01T08:00:00.000Z",
    armedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}
