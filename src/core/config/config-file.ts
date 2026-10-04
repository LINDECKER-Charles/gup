import { closeSync, constants, fstatSync, openSync, readFileSync, renameSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { isJsonObject, isSafeKey } from "./field-reader.js";
import type { JsonValue } from "./section.js";

/**
 * The settings file on disk: `{ "version": 1, "sections": { "<key>": {...} } }`.
 * Reading it never throws; it classifies the file instead, so the store can
 * decide between defaults, a backup, or staying in memory.
 */

/** Envelope version this build writes. A newer one makes the whole file read-only. */
export const ENVELOPE_VERSION = 1;
/** A settings file is a few hundred bytes; anything this big is not one. */
export const MAX_CONFIG_BYTES = 256 * 1024;

const BYTE_ORDER_MARK = "﻿";
const JSON_INDENT = 2;
/**
 * Read-only, and non-blocking where the OS has the flag: a FIFO planted at the
 * path is then classified as "not a file" instead of hanging the open until a
 * writer shows up. Windows has neither the flag nor FIFOs.
 */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

export interface ConfigDocument {
  readonly version: number;
  /** Raw section values by key, unknown ones included (they are preserved on write). */
  readonly sections: Readonly<Record<string, JsonValue>>;
}

export type ConfigFileRead =
  | { readonly kind: "missing" }
  | { readonly kind: "loaded"; readonly document: ConfigDocument }
  /** Exists but cannot be read (permissions): never backed up, never overwritten. */
  | { readonly kind: "unreadable"; readonly reason: string }
  /** Readable but not a settings document: to be moved aside. */
  | { readonly kind: "corrupt"; readonly reason: string };

export function emptyDocument(): ConfigDocument {
  return { version: ENVELOPE_VERSION, sections: {} };
}

/** Classify `file`; one larger than `maxBytes` is corrupt (not a settings file). */
export function readConfigFile(
  file: string,
  maxBytes: number = MAX_CONFIG_BYTES,
): ConfigFileRead {
  try {
    const fd = openSync(file, READ_FLAGS);
    try {
      return readOpenFile(fd, maxBytes);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "missing" };
    return { kind: "unreadable", reason: err instanceof Error ? err.message : String(code) };
  }
}

/**
 * The checks and the read go through one handle, so they see the same file:
 * the path cannot be swapped (for a symlink, a bigger file) between them.
 */
function readOpenFile(fd: number, maxBytes: number): ConfigFileRead {
  const stats = fstatSync(fd);
  if (!stats.isFile()) return { kind: "corrupt", reason: "pas un fichier" };
  if (stats.size > maxBytes) return { kind: "corrupt", reason: "fichier trop volumineux" };
  return parseDocument(readFileSync(fd, "utf8"));
}

function parseDocument(text: string): ConfigFileRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  } catch {
    return { kind: "corrupt", reason: "JSON invalide" };
  }
  if (!isJsonObject(raw)) return { kind: "corrupt", reason: "objet JSON attendu" };
  const { version, sections } = raw;
  if (!Number.isInteger(version) || (version as number) < 1) {
    return { kind: "corrupt", reason: "champ version invalide" };
  }
  if (sections !== undefined && !isJsonObject(sections)) {
    return { kind: "corrupt", reason: "champ sections invalide" };
  }
  const document = { version: version as number, sections: ownSections(sections) };
  return { kind: "loaded", document };
}

function ownSections(
  sections: Readonly<Record<string, unknown>> | undefined,
): Record<string, JsonValue> {
  const entries = Object.entries(sections ?? {}).filter(([key]) => isSafeKey(key));
  return Object.fromEntries(entries) as Record<string, JsonValue>;
}

/**
 * Move a corrupt file aside as `config.corrupt-YYYYMMDDTHHmmss.json` in the
 * same directory and return that path. Throws when the move fails — the
 * caller must then never overwrite the file it could not save.
 */
export function backupCorruptFile(file: string, now: Date): string {
  const extension = extname(file);
  const stem = basename(file, extension);
  const backup = join(dirname(file), `${stem}.corrupt-${compactTimestamp(now)}${extension}`);
  renameSync(file, backup);
  return backup;
}

/** `2026-10-03T14:22:05.123Z` → `20261003T142205` (UTC, sortable, filename-safe). */
function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").slice(0, "YYYYMMDDTHHmmss".length);
}

export function serializeDocument(document: ConfigDocument): string {
  return `${JSON.stringify(document, null, JSON_INDENT)}\n`;
}
