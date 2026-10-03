import { randomBytes } from "node:crypto";
import { ConfigStore } from "../../config/store.js";
import { storedRecurrence, toCron } from "../model/recurrence.js";
import type { Schedule, ScheduleDraft } from "../model/types.js";
import { SCHEDULES_SECTION, type SchedulesSection } from "./schedules-section.js";

/**
 * The schedules, over the settings store: every change re-reads the file
 * under its lock and writes it atomically, so two terminals editing
 * schedules never lose each other's work. Validation happens before (the
 * model's `validateDraft`); the repository stores.
 *
 * Writes throw the store's `ConfigWriteError` when the file cannot be saved.
 */

export type ScheduleLookup = Schedule | { readonly error: string };

/** Shortest accepted id prefix on the command line. */
export const MIN_ID_PREFIX = 4;
const ID_BYTES = 4;
/**
 * Bound of `schedules.json`: 50 schedules of 50 targets with 256-character
 * ids and labels come to about 1.5 MiB; anything far beyond is not ours.
 */
const SCHEDULES_FILE_MAX_BYTES = 4 * 1024 * 1024;

function randomScheduleId(): string {
  return randomBytes(ID_BYTES).toString("hex");
}

export class ScheduleRepo {
  readonly #openStore: () => ConfigStore;
  readonly #newId: () => string;
  #store: ConfigStore;

  /** `openStore` builds the store; {@link reload} calls it again to forget what was read. */
  constructor(openStore: () => ConfigStore, newId: () => string = randomScheduleId) {
    this.#openStore = openStore;
    this.#newId = newId;
    this.#store = openStore();
  }

  /** The repository of the schedules file `file` (null: in memory, nothing persisted). */
  static open(file: string | null): ScheduleRepo {
    return new ScheduleRepo(() => new ConfigStore({ file, maxBytes: SCHEDULES_FILE_MAX_BYTES }));
  }

  /**
   * Forget what was read: the next read sees the file as it is now, changes
   * made by another gup included (the menu stays open for long). A store in
   * memory starts over empty.
   */
  reload(): void {
    this.#store = this.#openStore();
  }

  list(): readonly Schedule[] {
    return this.#section().schedules;
  }

  /** A schedule by id or unique prefix (at least {@link MIN_ID_PREFIX} characters). */
  find(idOrPrefix: string): ScheduleLookup {
    const wanted = idOrPrefix.trim().toLowerCase();
    if (wanted.length < MIN_ID_PREFIX) {
      return { error: `« ${idOrPrefix} » : identifiant de ${MIN_ID_PREFIX} caractères au moins` };
    }
    const matches = this.list().filter((schedule) => schedule.id.startsWith(wanted));
    const [only] = matches;
    if (matches.length === 1 && only) return only;
    if (matches.length === 0) return { error: `Aucune planification « ${idOrPrefix} »` };
    const ids = matches.map((schedule) => schedule.id).join(", ");
    return { error: `« ${idOrPrefix} » désigne plusieurs planifications : ${ids}` };
  }

  /** Store a new schedule, armed now: no occurrence before its creation ever runs. */
  create(draft: ScheduleDraft, now: Date): Schedule {
    let created: Schedule | undefined;
    this.#store.update(SCHEDULES_SECTION, (current) => {
      const stamp = now.toISOString();
      created = {
        ...draft,
        id: this.#uniqueId(current),
        name: draft.name.trim(),
        recurrence: storedRecurrence(draft.recurrence),
        createdAt: stamp,
        armedAt: stamp,
      };
      return { ...current, schedules: [...current.schedules, created] };
    });
    if (!created) throw new Error("scheduler: schedule not created");
    return created;
  }

  /**
   * Give the schedule `id` the edited fields of `draft`, keeping its identity
   * and creation date. Re-arms when its recurrence changes or it is switched
   * on, so an edit never replays past occurrences. Null when no schedule has
   * this id any more (removed from another terminal).
   */
  replace(id: string, draft: ScheduleDraft, now: Date): Schedule | null {
    let replaced: Schedule | null = null;
    this.#change([id], (schedule) => {
      replaced = edited(schedule, draft, now);
      return replaced;
    });
    return replaced;
  }

  /** Delete the schedules with these exact ids; returns how many existed. */
  remove(ids: readonly string[]): number {
    let removed = 0;
    this.#store.update(SCHEDULES_SECTION, (current) => {
      const kept = current.schedules.filter((schedule) => !ids.includes(schedule.id));
      removed = current.schedules.length - kept.length;
      return { ...current, schedules: kept };
    });
    return removed;
  }

  /**
   * Enable the schedules with these exact ids; returns how many changed.
   * Enabling re-arms: a schedule paused for a month does not run the month's
   * occurrences in a burst.
   */
  enable(ids: readonly string[], now: Date): number {
    const armedAt = now.toISOString();
    return this.#change(ids, (schedule) =>
      schedule.enabled ? null : { ...schedule, enabled: true, armedAt },
    );
  }

  /** Disable the schedules with these exact ids; returns how many changed. */
  disable(ids: readonly string[]): number {
    return this.#change(ids, (schedule) =>
      schedule.enabled ? { ...schedule, enabled: false } : null,
    );
  }

  /** Until when the user has seen the runs' results in the menu; null when never. */
  seenUntil(): Date | null {
    const iso = this.#section().seenRunsUntil;
    return iso === null ? null : new Date(iso);
  }

  /** The user has seen every run finished up to `until`. */
  markSeen(until: Date): void {
    this.#store.update(SCHEDULES_SECTION, (current) => ({
      ...current,
      seenRunsUntil: until.toISOString(),
    }));
  }

  #section(): SchedulesSection {
    return this.#store.read(SCHEDULES_SECTION);
  }

  /** Apply `edit` to the listed schedules; null leaves one unchanged. Returns the change count. */
  #change(ids: readonly string[], edit: (schedule: Schedule) => Schedule | null): number {
    let changed = 0;
    this.#store.update(SCHEDULES_SECTION, (current) => ({
      ...current,
      schedules: current.schedules.map((schedule) => {
        const next = ids.includes(schedule.id) ? edit(schedule) : null;
        if (next === null) return schedule;
        changed++;
        return next;
      }),
    }));
    return changed;
  }

  #uniqueId(current: SchedulesSection): string {
    const taken = new Set(current.schedules.map((schedule) => schedule.id));
    for (;;) {
      const id = this.#newId();
      if (!taken.has(id)) return id;
    }
  }
}

function edited(schedule: Schedule, draft: ScheduleDraft, now: Date): Schedule {
  const isRetimed = toCron(schedule.recurrence) !== toCron(draft.recurrence);
  const isSwitchedOn = draft.enabled && !schedule.enabled;
  return {
    ...schedule,
    name: draft.name.trim(),
    recurrence: storedRecurrence(draft.recurrence),
    targets: draft.targets,
    enabled: draft.enabled,
    options: draft.options,
    ...((isRetimed || isSwitchedOn) && { armedAt: now.toISOString() }),
  };
}
