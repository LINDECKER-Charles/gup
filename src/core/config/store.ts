import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { localized } from "../i18n/localized.js";
import { withFileLock } from "../state/file-lock.js";
import { NODE_FILE_OPS, writeFileAtomic, type FileOps } from "./atomic-write.js";
import {
  backupCorruptFile,
  CORRUPT_REASONS,
  emptyDocument,
  ENVELOPE_VERSION,
  readConfigFile,
  serializeDocument,
  type ConfigDocument,
  type CorruptReason,
} from "./config-file.js";
import {
  createFieldReader,
  isJsonObject,
  isSafeKey,
  objectExpected,
  type ConfigIssue,
} from "./field-reader.js";
import { configFilePath, isConfigDisabled } from "./paths.js";
import type { ConfigSectionDef, JsonObject, JsonValue } from "./section.js";

/**
 * gup's persisted settings: one JSON file, one namespace (section) per
 * feature, each read leniently and written sparsely — only the fields that
 * differ from the code defaults, so a default changed in a later release
 * reaches every user who never touched it.
 *
 * Writes are read-modify-write at section granularity inside a short file
 * lock: the file is re-read, only the section being saved is replaced, and
 * every other section (and every unknown field) comes from the fresh copy.
 * Two processes saving at once can no longer lose each other's sections.
 *
 * The store never prints: a write while the full-screen app is up would
 * corrupt the frame. Problems surface through {@link ConfigStore.status} and
 * {@link ConfigWriteError}. The elevated `__admin-batch` child never reads it:
 * a user-writable file must not steer an elevated process.
 */

export type ConfigState = "disabled" | "unavailable" | "missing" | "loaded" | "recovered";

export interface ConfigStatus {
  readonly file: string | null;
  /** As loaded, except "missing", which turns "loaded" once a save creates the file. */
  readonly state: ConfigState;
  /** Where a corrupt file was moved, when state is "recovered". */
  readonly backup?: string;
  /**
   * Human-readable problems, in the language active when the status is read:
   * "interface.mouse: expected a boolean". A section's own go once a save
   * rewrote it; the file's stay.
   */
  readonly issues: readonly string[];
  /** Sections written by a newer gup: readable, never overwritten. */
  readonly readOnlySections: readonly string[];
  /** Why the last save failed; gone once a later save persists. */
  readonly lastWriteError?: string;
}

export type ConfigWriteFailure = "unavailable" | "read-only" | "io" | "changed-on-disk";

export class ConfigWriteError extends Error {
  readonly failure: ConfigWriteFailure;

  constructor(failure: ConfigWriteFailure, message: string) {
    super(message);
    this.name = "ConfigWriteError";
    this.failure = failure;
  }
}

export interface ConfigStoreOptions {
  /** null: no anchor on this platform — the store runs in memory. */
  readonly file: string | null;
  /** `GUP_CONFIG=0`: defaults in memory, the disk is never touched. */
  readonly isDisabled?: boolean;
  /** Injected in tests to simulate a locked or failing disk. */
  readonly fileOps?: FileOps;
  /** Clock for the corrupt-file backup name. */
  readonly now?: () => Date;
  /**
   * Largest file accepted, in bytes; a bigger one is treated as corrupt.
   * Default: a settings file's MAX_CONFIG_BYTES. A store holding records
   * (the scheduler's schedules) sizes it to its own bounds.
   */
  readonly maxBytes?: number;
}

interface LoadedFile {
  readonly state: ConfigState;
  readonly document: ConfigDocument;
  readonly backup?: string;
}

/** What a persistence pass does to one section: derive its next value from the fresh one. */
interface SectionChange<T extends object> {
  readonly section: ConfigSectionDef<T>;
  readonly compute: (current: T) => T;
}

const VERSION_FIELD = "v";
const DIR_MODE = 0o700;
const FILE_LABEL = "config.json";

/** The store's own words: what is wrong with the file, and why a save failed. */
const STORE_LABELS = localized({
  en: {
    /** "config.json: EACCES: permission denied, open '…'". */
    unreadable: (reason: string) => `${FILE_LABEL}: ${reason}`,
    /** "config.json: invalid JSON — kept as …\config.corrupt-20261003T142205.json". */
    recovered: (reason: string, backup: string) => `${FILE_LABEL}: ${reason} — kept as ${backup}`,
    /** `why`: why the file could not be moved aside. */
    unrecoverable: (reason: string, why: string) =>
      `${FILE_LABEL}: ${reason} (backup failed: ${why})`,
    noLocation: "no location for the settings file",
    readOnly: (key: string) => `section ${key} written by a newer version of gup`,
    changedOnDisk: (reason: string) => `file changed in the meantime: ${reason}`,
  },
  fr: {
    unreadable: (reason) => `${FILE_LABEL} : ${reason}`,
    recovered: (reason, backup) => `${FILE_LABEL} : ${reason} — copie de sauvegarde ${backup}`,
    unrecoverable: (reason, why) => `${FILE_LABEL} : ${reason} (sauvegarde impossible : ${why})`,
    noLocation: "emplacement de configuration indisponible",
    readOnly: (key) => `section ${key} écrite par une version plus récente de gup`,
    changedOnDisk: (reason) => `fichier modifié entre-temps : ${reason}`,
  },
});

export class ConfigStore {
  readonly #options: ConfigStoreOptions;
  #loaded: LoadedFile | null = null;
  readonly #values = new Map<string, object>();
  /** What was wrong with the file itself (corrupt, unreadable) when it was loaded. */
  readonly #fileIssues: ConfigIssue[] = [];
  /** What was wrong with each section as read, until a save rewrites it. */
  readonly #sectionIssues = new Map<string, readonly ConfigIssue[]>();
  readonly #readOnly = new Set<string>();
  #lastWriteError: string | undefined;
  readonly #listeners = new Set<(sectionKey: string) => void>();

  constructor(options: ConfigStoreOptions) {
    this.#options = options;
  }

  /** The section's current value. Loads the file on first use (synchronously), then caches. */
  read<T extends object>(section: ConfigSectionDef<T>): T {
    const cached = this.#values.get(section.key);
    if (cached) return cached as T;
    const document = this.#file().document;
    if (isReadOnlySection(document, section)) this.#readOnly.add(section.key);
    const issues: ConfigIssue[] = [];
    const value = parseSection(section, document, issues);
    this.#sectionIssues.set(section.key, issues);
    this.#values.set(section.key, value);
    return value;
  }

  /**
   * Make `value` the section's value for this process (subscribers hear it
   * at once), then persist it. Throws {@link ConfigWriteError} when it cannot
   * be persisted; the value stays in effect for the session regardless.
   */
  write<T extends object>(section: ConfigSectionDef<T>, value: T): void {
    this.#remember(section.key, value);
    if (this.#file().state === "disabled") return;
    this.#persist(section, () => value);
  }

  /**
   * Re-read `section` from disk, apply `mutate` to that fresh value and
   * persist the result, all inside the file lock; returns the stored value.
   * Use it when another process may edit the same section (schedules).
   * Throws {@link ConfigWriteError} — and changes nothing — when the section
   * cannot be persisted.
   */
  update<T extends object>(section: ConfigSectionDef<T>, mutate: (current: T) => T): T {
    const next =
      this.#file().state === "disabled"
        ? mutate(this.read(section))
        : this.#persist(section, mutate);
    this.#remember(section.key, next);
    return next;
  }

  /** Back to the code defaults: the section disappears from the file. */
  reset(section: ConfigSectionDef<object>): void {
    this.write(section, section.defaults);
  }

  /** The file's state now, its problems worded in the active language. */
  status(): ConfigStatus {
    const loaded = this.#file();
    const newerEnvelope = loaded.document.version > ENVELOPE_VERSION;
    const readOnly = newerEnvelope ? Object.keys(loaded.document.sections) : [];
    return {
      file: this.#options.file,
      state: loaded.state,
      ...(loaded.backup !== undefined && { backup: loaded.backup }),
      issues: [this.#fileIssues, ...this.#sectionIssues.values()].flat().map((issue) => issue()),
      readOnlySections: [...new Set([...readOnly, ...this.#readOnly])],
      ...(this.#lastWriteError !== undefined && { lastWriteError: this.#lastWriteError }),
    };
  }

  /** Called with the section key after every write, update or reset. */
  subscribe(listener: (sectionKey: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #file(): LoadedFile {
    this.#loaded ??= this.#load();
    return this.#loaded;
  }

  #load(): LoadedFile {
    const { file, isDisabled } = this.#options;
    if (isDisabled) return { state: "disabled", document: emptyDocument() };
    if (file === null) return { state: "unavailable", document: emptyDocument() };
    const read = readConfigFile(file, this.#options.maxBytes);
    if (read.kind === "missing") return { state: "missing", document: emptyDocument() };
    if (read.kind === "loaded") return { state: "loaded", document: read.document };
    if (read.kind === "unreadable") {
      return this.#unavailable(() => STORE_LABELS.unreadable(read.reason));
    }
    return this.#recover(file, read.reason);
  }

  /**
   * Move the corrupt file aside and start empty — or, if it cannot be moved,
   * never touch it. Runs while startup reads the language setting: what went
   * wrong is worded later, when the status is read.
   */
  #recover(file: string, reason: CorruptReason): LoadedFile {
    try {
      const backup = backupCorruptFile(file, (this.#options.now ?? (() => new Date()))());
      this.#fileIssues.push(() => STORE_LABELS.recovered(CORRUPT_REASONS[reason], backup));
      return { state: "recovered", document: emptyDocument(), backup };
    } catch (err) {
      const error = messageOf(err);
      return this.#unavailable(() => STORE_LABELS.unrecoverable(CORRUPT_REASONS[reason], error));
    }
  }

  #unavailable(issue: ConfigIssue): LoadedFile {
    this.#fileIssues.push(issue);
    return { state: "unavailable", document: emptyDocument() };
  }

  #persist<T extends object>(section: ConfigSectionDef<T>, compute: (current: T) => T): T {
    const { file } = this.#options;
    if (file === null || this.#file().state === "unavailable") {
      throw this.#failed(new ConfigWriteError("unavailable", STORE_LABELS.noLocation));
    }
    if (isReadOnlySection(this.#file().document, section)) {
      throw this.#failed(readOnlyError(section));
    }
    try {
      mkdirSync(dirname(file), { recursive: true, mode: DIR_MODE });
      const stored = withFileLock(file, () => this.#rewrite(file, { section, compute }));
      this.#persisted(section.key);
      return stored;
    } catch (err) {
      throw this.#failed(err);
    }
  }

  /**
   * The file holds what this process wrote: an earlier failure no longer
   * stands, a file that was missing at load exists now, and the section was
   * rewritten from valid values only — what was wrong with it is gone.
   */
  #persisted(sectionKey: string): void {
    this.#lastWriteError = undefined;
    this.#sectionIssues.delete(sectionKey);
    const loaded = this.#file();
    if (loaded.state === "missing") this.#loaded = { ...loaded, state: "loaded" };
  }

  #rewrite<T extends object>(file: string, change: SectionChange<T>): T {
    const { section, compute } = change;
    const fresh = freshDocument(file, this.#options.maxBytes);
    if (isReadOnlySection(fresh, section)) throw readOnlyError(section);
    const next = compute(parseSection(section, fresh, []));
    const text = serializeDocument(withSection(fresh, section, next));
    writeFileAtomic(file, text, this.#options.fileOps ?? NODE_FILE_OPS);
    return next;
  }

  /** Record the failure for status() and hand it back as a ConfigWriteError. */
  #failed(err: unknown): ConfigWriteError {
    const error =
      err instanceof ConfigWriteError ? err : new ConfigWriteError("io", messageOf(err));
    this.#lastWriteError = error.message;
    return error;
  }

  #remember(key: string, value: object): void {
    this.#values.set(key, value);
    for (const listener of this.#listeners) {
      try {
        listener(key);
      } catch {
        // A subscriber's failure is its own; the value is stored.
      }
    }
  }
}

let processStore: ConfigStore | null = null;

/** The process-wide store at configFilePath(), honouring GUP_CONFIG. */
export function configStore(): ConfigStore {
  processStore ??= new ConfigStore({
    file: configFilePath(),
    isDisabled: isConfigDisabled(process.env),
  });
  return processStore;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readOnlyError(section: ConfigSectionDef<object>): ConfigWriteError {
  return new ConfigWriteError("read-only", STORE_LABELS.readOnly(section.key));
}

/** The file as it is now, inside the lock. */
function freshDocument(file: string, maxBytes: number | undefined): ConfigDocument {
  const read = readConfigFile(file, maxBytes);
  if (read.kind === "loaded") return read.document;
  if (read.kind === "missing") return emptyDocument();
  if (read.kind === "corrupt") {
    const reason = CORRUPT_REASONS[read.reason];
    throw new ConfigWriteError("changed-on-disk", STORE_LABELS.changedOnDisk(reason));
  }
  throw new ConfigWriteError("io", read.reason);
}

/** The `v` a section was written with, or this build's version when absent or invalid. */
function sectionVersion(raw: JsonValue | undefined, current: number): number {
  const version = isJsonObject(raw) ? raw[VERSION_FIELD] : undefined;
  return Number.isInteger(version) && (version as number) >= 1 ? (version as number) : current;
}

function isReadOnlySection(document: ConfigDocument, section: ConfigSectionDef<object>): boolean {
  if (document.version > ENVELOPE_VERSION) return true;
  return sectionVersion(document.sections[section.key], section.version) > section.version;
}

function parseSection<T extends object>(
  section: ConfigSectionDef<T>,
  document: ConfigDocument,
  issues: ConfigIssue[],
): T {
  const raw = document.sections[section.key];
  if (raw !== undefined && !isJsonObject(raw)) issues.push(objectExpected(section.key));
  const object = (isJsonObject(raw) ? raw : {}) as JsonObject;
  const version = sectionVersion(raw, section.version);
  const upgraded =
    version < section.version && section.migrate ? section.migrate(object, version) : object;
  return section.parse(createFieldReader(upgraded, section.key, issues));
}

/** `document` with `section` replaced in place (or removed when nothing is left to write). */
function withSection<T extends object>(
  document: ConfigDocument,
  section: ConfigSectionDef<T>,
  value: T,
): ConfigDocument {
  const written = sectionObject(section, value, document.sections[section.key]);
  const keys = Object.keys(document.sections);
  if (!keys.includes(section.key)) keys.push(section.key);
  const entries = keys.flatMap((key): Array<[string, JsonValue]> => {
    if (key !== section.key) return [[key, document.sections[key] ?? null]];
    return written ? [[key, written]] : [];
  });
  return { version: ENVELOPE_VERSION, sections: Object.fromEntries(entries) };
}

/**
 * The section as written: its version, the fields of the file this build
 * does not know (kept for the build that does), then the known fields that
 * differ from their defaults, in the order of the defaults.
 */
function sectionObject<T extends object>(
  section: ConfigSectionDef<T>,
  value: T,
  previous: JsonValue | undefined,
): JsonObject | null {
  const defaults = section.defaults as Readonly<Record<string, unknown>>;
  const current = value as Readonly<Record<string, unknown>>;
  const known = Object.keys(defaults);
  const unknown = isJsonObject(previous)
    ? Object.entries(previous).filter(([key]) => isUnknownField(key, known))
    : [];
  const changed = known
    .filter((key) => current[key] !== undefined && !isSameJson(current[key], defaults[key]))
    .map((key): [string, JsonValue] => [key, toJson(current[key])]);
  if (unknown.length === 0 && changed.length === 0) return null;
  return Object.fromEntries([[VERSION_FIELD, section.version], ...unknown, ...changed]);
}

function isUnknownField(key: string, known: readonly string[]): boolean {
  return key !== VERSION_FIELD && isSafeKey(key) && !known.includes(key);
}

function isSameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
