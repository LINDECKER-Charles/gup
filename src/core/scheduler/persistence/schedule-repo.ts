import { randomBytes } from "node:crypto";
import { ConfigStore } from "../../config/store.js";
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
  readonly #store: ConfigStore;
  readonly #newId: () => string;

  constructor(store: ConfigStore, newId: () => string = randomScheduleId) {
    this.#store = store;
    this.#newId = newId;
  }

  /** The repository of the schedules file `file` (null: in memory, nothing persisted). */
  static open(file: string | null): ScheduleRepo {
    return new ScheduleRepo(new ConfigStore({ file, maxBytes: SCHEDULES_FILE_MAX_BYTES }));
  }

  list(): readonly Schedule[] {
    return this.#store.read(SCHEDULES_SECTION).schedules;
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
        createdAt: stamp,
        armedAt: stamp,
      };
      return { schedules: [...current.schedules, created] };
    });
    if (!created) throw new Error("scheduler: schedule not created");
    return created;
  }

  /** Delete the schedules with these exact ids; returns how many existed. */
  remove(ids: readonly string[]): number {
    let removed = 0;
    this.#store.update(SCHEDULES_SECTION, (current) => {
      const kept = current.schedules.filter((schedule) => !ids.includes(schedule.id));
      removed = current.schedules.length - kept.length;
      return { schedules: kept };
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

  /** Apply `edit` to the listed schedules; null leaves one unchanged. Returns the change count. */
  #change(ids: readonly string[], edit: (schedule: Schedule) => Schedule | null): number {
    let changed = 0;
    this.#store.update(SCHEDULES_SECTION, (current) => ({
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
