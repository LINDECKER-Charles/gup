import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import type { LogLevel } from "./log.js";
import type { LogSink } from "./types.js";

/**
 * The debug log on disk: one JSONL file per UTC day in the logs directory,
 * split into numbered parts when a day grows past a size, kept for a number
 * of days.
 *
 * Writes are synchronous, on a cached append descriptor: every command ends
 * with `process.exit(code)`, which would drop pending asynchronous writes —
 * the last lines before a crash are the ones that matter. One `write` per
 * record on an append descriptor lands whole, so the parent, an elevated
 * child and a concurrent `gup` never interleave inside a line.
 */

/** `gup-2026-10-03.jsonl`, `gup-2026-10-03.1.jsonl` … `.9.jsonl`. */
export const LOG_FILE_PATTERN = /^gup-(\d{4}-\d{2}-\d{2})(?:\.([1-9]))?\.jsonl$/;
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Parts after the first one; the pattern's single digit bounds it. */
const DEFAULT_MAX_PARTS = 9;
export const DEFAULT_RETENTION_DAYS = 14;
export const MAX_RETENTION_DAYS = 365;
export const RETENTION_ENV = "GUP_LOG_RETENTION_DAYS";

const DAY_MS = 86_400_000;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface FileSinkOptions {
  readonly dir: string;
  readonly maxFileBytes?: number;
  readonly maxParts?: number;
  /** Days kept, today included (`GUP_LOG_RETENTION_DAYS`, 1..365). */
  readonly retentionDays?: number;
  readonly now?: () => Date;
  /**
   * The record written once per day when the last part is full: from then on
   * only errors are written that day.
   */
  readonly cappedLine?: (day: string) => string;
}

/** The file name of `part` (0 = the day's first file). */
export function logFileName(day: string, part: number): string {
  return part === 0 ? `gup-${day}.jsonl` : `gup-${day}.${part}.jsonl`;
}

/** `GUP_LOG_RETENTION_DAYS` when it is a whole number of days in 1..365, else the default. */
export function retentionDaysOf(raw: string | undefined): number {
  const days = Number(raw);
  const isValid = raw !== undefined && Number.isInteger(days) && days >= 1;
  return isValid ? Math.min(days, MAX_RETENTION_DAYS) : DEFAULT_RETENTION_DAYS;
}

/** The UTC day of `date`: `2026-10-03`. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class FileSink implements LogSink {
  readonly #dir: string;
  readonly #maxFileBytes: number;
  readonly #maxParts: number;
  readonly #retentionDays: number;
  readonly #now: () => Date;
  readonly #cappedLine: ((day: string) => string) | undefined;
  #fd: number | null = null;
  #day = "";
  #part = 0;
  #size = 0;
  #isCapped = false;
  #isPruned = false;

  constructor(options: FileSinkOptions) {
    this.#dir = options.dir;
    this.#maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.#maxParts = options.maxParts ?? DEFAULT_MAX_PARTS;
    this.#retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.#now = options.now ?? (() => new Date());
    this.#cappedLine = options.cappedLine;
  }

  /** Throws on an I/O failure: the backend then stops writing and says so once. */
  write(line: string, level: LogLevel): void {
    const day = utcDay(this.#now());
    if (day !== this.#day || this.#fd === null) this.#openDay(day);
    const bytes = Buffer.byteLength(line) + 1;
    if (!this.#isCapped && this.#size > 0 && this.#size + bytes > this.#maxFileBytes) {
      this.#nextPart();
    }
    if (this.#isCapped && level !== "error") return;
    this.#append(line);
  }

  close(): void {
    if (this.#fd !== null) closeSync(this.#fd);
    this.#fd = null;
    this.#day = "";
  }

  /** First write of a day: the first part with room, opened for appending. */
  #openDay(day: string): void {
    this.close();
    this.#day = day;
    this.#part = 0;
    this.#isCapped = false;
    mkdirSync(this.#dir, { recursive: true, mode: DIR_MODE });
    if (!this.#isPruned) this.#prune();
    this.#openPart();
    while (!this.#isCapped && this.#size >= this.#maxFileBytes) this.#nextPart();
  }

  #openPart(): void {
    this.#fd = openSync(join(this.#dir, logFileName(this.#day, this.#part)), "a", FILE_MODE);
    this.#size = fstatSync(this.#fd).size;
  }

  #nextPart(): void {
    if (this.#part >= this.#maxParts) {
      this.#isCapped = true;
      if (this.#cappedLine) this.#append(this.#cappedLine(this.#day));
      return;
    }
    if (this.#fd !== null) closeSync(this.#fd);
    this.#part += 1;
    this.#openPart();
  }

  #append(line: string): void {
    if (this.#fd === null) return;
    const text = `${line}\n`;
    writeSync(this.#fd, text);
    this.#size += Buffer.byteLength(text);
  }

  /**
   * Once per process: delete the log files older than the retention. Only
   * names this sink writes, only regular files — never a symlink or a
   * junction someone planted. A file another gup holds open (EBUSY/EPERM on
   * Windows) stays for the next run.
   */
  #prune(): void {
    this.#isPruned = true;
    const oldestKept = utcDay(new Date(this.#now().getTime() - (this.#retentionDays - 1) * DAY_MS));
    for (const name of listNames(this.#dir)) {
      const day = LOG_FILE_PATTERN.exec(name)?.[1];
      if (day === undefined || day >= oldestKept) continue;
      removeRegularFile(join(this.#dir, name));
    }
  }
}

/** Retention is housekeeping: an unreadable directory skips it, the write still happens. */
function listNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function removeRegularFile(path: string): void {
  try {
    if (lstatSync(path).isFile()) unlinkSync(path);
  } catch {
    // Held by another process or already gone: the next run retries.
  }
}
