import { ConfigWriteError } from "../../core/config/store.js";
import { log } from "../../core/log/log.js";
import { getProvider } from "../../core/registry.js";
import { ManualRun, type PreparedRun } from "../../core/scheduler/manual-run.js";
import { ManualRunTracker } from "../../core/scheduler/manual-run-tracker.js";
import type {
  Schedule,
  ScheduleDraft,
  ScheduleRunRecord,
} from "../../core/scheduler/model/types.js";
import {
  validateDraft,
  type ValidationIssue,
} from "../../core/scheduler/model/validate-schedule.js";
import { unseenRuns } from "../../core/scheduler/run-summary.js";
import type { Mechanism } from "../../core/scheduler/trigger/os-trigger.js";
import type { SyncResult } from "../../core/scheduler/trigger/trigger-sync.js";
import type { UpdateObserver } from "../../core/update/update-ports.js";
import type { UpdateReport } from "../../core/update/update-report.js";
import type {
  ChangeOutcome,
  SchedulesPort,
  SchedulesSnapshot,
  TriggerSummary,
} from "../../ui/panels/schedules/schedules-port.js";
import { SCHEDULE_NOTICES } from "../../ui/text/schedule/schedule-menu-labels.js";
import { targetResolver } from "./run-deps.js";
import {
  processSchedulerServices,
  readTriggerReport,
  type SchedulerServices,
} from "./scheduler-services.js";
import { reconcileTrigger } from "./trigger-commands.js";

/**
 * The menu's Schedules view wired to this machine: the schedules file,
 * the run state, the OS trigger, the targeted scan. Every change is saved
 * first, then the trigger is brought in line — as `gup schedule` does.
 * Reads are cached until `reload()`, because the sidebar and Packages read
 * them at every frame.
 */

type Services = () => SchedulerServices | { readonly error: string };

const EMPTY: SchedulesSnapshot = { schedules: [], state: { v: 1, schedules: {} }, seenUntil: null };

export class SchedulesController implements SchedulesPort {
  readonly #services: Services;
  readonly #tracker: ManualRunTracker;
  #snapshot: SchedulesSnapshot | null = null;

  constructor(services: Services) {
    this.#services = services;
    this.#tracker = new ManualRunTracker(
      (prepared, report, endedAt) => void this.#settle(prepared, report, endedAt),
      () => this.#ready()?.clock() ?? new Date(),
    );
  }

  /** Records the view's "run now" when its updates run outside the screen. */
  get runTracker(): UpdateObserver {
    return this.#tracker;
  }

  snapshot(): SchedulesSnapshot {
    this.#snapshot ??= this.#read();
    return this.#snapshot;
  }

  reload(): void {
    this.#ready()?.repo.reload();
    this.#snapshot = null;
  }

  markSeen(): void {
    const services = this.#ready();
    if (!services || unseenRuns(this.snapshot()).runs === 0) return;
    try {
      services.repo.markSeen(services.clock());
    } catch (err) {
      log.warn("scheduler.seen-write-failed", { error: String(err) });
    }
    this.#snapshot = null;
  }

  validate(draft: ScheduleDraft, editedId?: string): readonly ValidationIssue[] {
    const services = this.#ready();
    if (!services) return [{ field: "schedules" as const, message: this.#unavailable() }];
    const others = this.snapshot().schedules.filter((schedule) => schedule.id !== editedId);
    const context = { now: services.clock(), providers: services.providers };
    return validateDraft(draft, { ...context, existingCount: others.length });
  }

  create(draft: ScheduleDraft): Promise<ChangeOutcome> {
    return this.#change((services) => services.repo.create(draft, services.clock()));
  }

  replace(id: string, draft: ScheduleDraft): Promise<ChangeOutcome> {
    return this.#change((services) => services.repo.replace(id, draft, services.clock()));
  }

  remove(id: string): Promise<ChangeOutcome> {
    return this.#change((services) => {
      const removed = services.repo.list().find((schedule) => schedule.id === id) ?? null;
      services.repo.remove([id]);
      return removed;
    });
  }

  enable(id: string): Promise<ChangeOutcome> {
    return this.#change((services) => {
      services.repo.enable([id], services.clock());
      return services.repo.list().find((schedule) => schedule.id === id) ?? null;
    });
  }

  disable(id: string): Promise<ChangeOutcome> {
    return this.#change((services) => {
      services.repo.disable([id]);
      return services.repo.list().find((schedule) => schedule.id === id) ?? null;
    });
  }

  providerName(providerId: string): string {
    return getProvider(providerId)?.displayName ?? providerId;
  }

  /**
   * A schedule's name, as last read — for the Journal, whose history keeps
   * only the id. Undefined for one deleted since, or when the schedules
   * cannot be read.
   */
  scheduleName(id: string): string | undefined {
    return this.snapshot().schedules.find((schedule) => schedule.id === id)?.name;
  }

  now(): Date {
    return this.#ready()?.clock() ?? new Date();
  }

  async trigger(): Promise<TriggerSummary> {
    const services = this.#ready();
    if (!services) return { health: { kind: "none" }, mechanism: null };
    const { health, mechanism, unsupported } = await readTriggerReport(services);
    return { health, mechanism, ...(unsupported !== undefined && { unsupported }) };
  }

  mechanism(): Mechanism | null {
    const trigger = this.#ready()?.trigger;
    return trigger && "mechanism" in trigger ? trigger.mechanism : null;
  }

  needsConsent(): boolean {
    const services = this.#ready();
    return services !== null && services.sync !== null && services.installs.read() === null;
  }

  repair(): Promise<SyncResult> {
    const services = this.#ready();
    if (services?.sync) return services.sync.reinstall();
    return Promise.resolve({ kind: "failed", reason: this.#unsupported(services) });
  }

  async prepareRun(id: string): Promise<PreparedRun | { readonly error: string }> {
    const services = this.#ready();
    if (!services) return { error: this.#unavailable() };
    const schedule = services.repo.list().find((candidate) => candidate.id === id);
    if (!schedule) return { error: SCHEDULE_NOTICES.vanished };
    try {
      const prepared = await manualRun(services).prepare(schedule);
      if (prepared.plan.updates.length > 0) this.#tracker.arm(prepared);
      return prepared;
    } catch (err) {
      log.warn("scheduler.run-now-failed", { scheduleId: id, error: String(err) });
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * The in-screen launcher hands its report over once the user leaves the
   * results screen: the run ended with its last update, which the tracker
   * saw, not now.
   */
  recordRun(prepared: PreparedRun, report: UpdateReport | null): ScheduleRunRecord | null {
    const { id } = prepared.schedule;
    const endedAt = this.#tracker.endedAt(id) ?? undefined;
    this.#tracker.disarm(id);
    return this.#settle(prepared, report, endedAt);
  }

  #settle(
    prepared: PreparedRun,
    report: UpdateReport | null,
    endedAt?: Date,
  ): ScheduleRunRecord | null {
    const services = this.#ready();
    this.#snapshot = null;
    return services ? manualRun(services).settle(prepared, report, endedAt) : null;
  }

  /**
   * Save through `write` — which returns the schedule changed, or null when
   * it no longer exists (removed from another terminal) — then bring the OS
   * trigger in line. A file that cannot be written saves nothing.
   */
  async #change(write: (services: SchedulerServices) => Schedule | null): Promise<ChangeOutcome> {
    const services = this.#ready();
    if (!services) return { isSaved: false, error: this.#unavailable() };
    let schedule: Schedule | null;
    try {
      schedule = write(services);
    } catch (err) {
      if (!(err instanceof ConfigWriteError)) throw err;
      return { isSaved: false, error: err.message };
    }
    this.#snapshot = null;
    if (schedule === null) return { isSaved: false, error: SCHEDULE_NOTICES.vanished };
    return { isSaved: true, schedule, sync: await reconcileTrigger(services) };
  }

  #read(): SchedulesSnapshot {
    const services = this.#ready();
    if (!services) return EMPTY;
    const { repo, state } = services;
    return { schedules: repo.list(), state: state.read(), seenUntil: repo.seenUntil() };
  }

  #ready(): SchedulerServices | null {
    const services = this.#services();
    return "error" in services ? null : services;
  }

  #unavailable(): string {
    const services = this.#services();
    return "error" in services ? services.error : "";
  }

  #unsupported(services: SchedulerServices | null): string {
    if (services && "unsupported" in services.trigger) return services.trigger.unsupported;
    return this.#unavailable();
  }
}

function manualRun(services: SchedulerServices): ManualRun {
  return new ManualRun({
    clock: services.clock,
    resolver: targetResolver(services),
    state: services.state,
  });
}

let shared: SchedulesController | null = null;

/** The menu's controller, one per process, over the process's scheduler services. */
export function menuSchedules(): SchedulesController {
  shared ??= new SchedulesController(processSchedulerServices);
  return shared;
}
