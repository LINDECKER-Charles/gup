import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OperationContext } from "../state/run-context.js";
import { LOG_FILE_PATTERN, utcDay } from "./file-sink.js";
import type { LogLevel } from "./log.js";
import {
  isEventName,
  isLogLevel,
  levelRank,
  LOG_SCHEMA_VERSION,
  type LogData,
  type LogRecord,
} from "./types.js";

/**
 * Reading the debug log back, for display and export only (`gup log`, the
 * diagnostic archive, the journal view): what it returns never feeds a
 * decision. Content never makes it throw — a line that is not a well-formed
 * record is counted and skipped; only I/O errors propagate.
 */

/** A longer line is not one the backend wrote (its data is bounded well below). */
export const MAX_LINE_LENGTH = 64 * 1024;
const MAX_ID_LENGTH = 256;
const OPERATIONS: ReadonlySet<string> = new Set(["detect", "scan", "update"]);

export interface LogFileInfo {
  readonly path: string;
  readonly name: string;
  /** UTC day the file holds: `2026-10-03`. */
  readonly day: string;
  /** 0 for the day's first file. */
  readonly part: number;
  readonly bytes: number;
}

export interface LogQuery {
  /** The newest records to return, at most. */
  readonly limit: number;
  /** Least severe level kept (`warn` keeps errors and warnings). */
  readonly minLevel?: LogLevel;
  /** Oldest record kept; null or absent: no bound. */
  readonly since?: Date | null;
  /** Kept when the raw line contains it, case ignored. */
  readonly grep?: string;
}

export interface LogTail {
  /** Oldest first. */
  readonly records: readonly LogRecord[];
  /** The files the log holds, newest first. */
  readonly files: readonly LogFileInfo[];
  /** Lines read that were not records. */
  readonly malformed: number;
}

/** The log files of `dir`, newest first; a missing directory has none. */
export async function listLogFiles(dir: string): Promise<LogFileInfo[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const files = await Promise.all(names.map((name) => fileInfo(dir, name)));
  return files
    .filter((file): file is LogFileInfo => file !== null)
    .sort((a, b) => b.day.localeCompare(a.day) || b.part - a.part);
}

/** The newest records matching `query`, read newest file first until enough are found. */
export async function readLogTail(query: LogQuery, dir: string | null): Promise<LogTail> {
  if (dir === null) return { records: [], files: [], malformed: 0 };
  const files = await listLogFiles(dir);
  const oldestDay = query.since ? utcDay(query.since) : null;
  const scan = { found: [] as LogRecord[], malformed: 0 };
  for (const file of files) {
    if (scan.found.length >= query.limit || (oldestDay !== null && file.day < oldestDay)) break;
    collectNewest(await readFile(file.path, "utf8"), query, scan);
  }
  const records = scan.found.sort((a, b) => a.ts.localeCompare(b.ts));
  return { records, files, malformed: scan.malformed };
}

/** One line of a log file as a record, or null when it is not one (strict: known fields only). */
export function parseLogLine(line: string): LogRecord | null {
  if (line.length === 0 || line.length > MAX_LINE_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  return isObject(parsed) ? recordOf(parsed) : null;
}

/** The file's lines, last first, into `scan` until the query has its count. */
function collectNewest(
  content: string,
  query: LogQuery,
  scan: { found: LogRecord[]; malformed: number },
): void {
  const lines = content.split(/\r?\n/);
  const grep = query.grep?.toLowerCase();
  for (let i = lines.length - 1; i >= 0 && scan.found.length < query.limit; i--) {
    const line = lines[i] ?? "";
    if (line.length === 0) continue;
    const record = parseLogLine(line);
    if (!record) scan.malformed += 1;
    else if (isWanted(record, query) && (!grep || line.toLowerCase().includes(grep))) {
      scan.found.push(record);
    }
  }
}

function isWanted(record: LogRecord, query: LogQuery): boolean {
  if (query.minLevel && levelRank(record.level) > levelRank(query.minLevel)) return false;
  return !query.since || Date.parse(record.ts) >= query.since.getTime();
}

async function fileInfo(dir: string, name: string): Promise<LogFileInfo | null> {
  const match = LOG_FILE_PATTERN.exec(name);
  if (!match?.[1]) return null;
  const path = join(dir, name);
  try {
    const stats = await lstat(path);
    if (!stats.isFile()) return null;
    return { path, name, day: match[1], part: Number(match[2] ?? 0), bytes: stats.size };
  } catch {
    // Pruned by another gup between the listing and here.
    return null;
  }
}

function recordOf(raw: Readonly<Record<string, unknown>>): LogRecord | null {
  if (!hasValidEnvelope(raw)) return null;
  const ctx = contextOf(raw["ctx"]);
  const data = raw["data"];
  return {
    v: LOG_SCHEMA_VERSION,
    ts: raw["ts"] as string,
    level: raw["level"] as LogLevel,
    event: raw["event"] as string,
    runId: raw["runId"] as string,
    pid: raw["pid"] as number,
    ...(ctx && { ctx }),
    ...(isObject(data) && { data: data as LogData }),
    ...(raw["elevated"] === true && { elevated: true }),
  };
}

function hasValidEnvelope(raw: Readonly<Record<string, unknown>>): boolean {
  const { v, ts, level, event, runId, pid } = raw;
  return (
    v === LOG_SCHEMA_VERSION &&
    typeof ts === "string" &&
    !Number.isNaN(Date.parse(ts)) &&
    isLogLevel(level) &&
    typeof event === "string" &&
    isEventName(event) &&
    isBoundedString(runId) &&
    Number.isInteger(pid) &&
    (pid as number) >= 0
  );
}

/** A well-formed operation context, or undefined (absent or not one). */
function contextOf(raw: unknown): OperationContext | undefined {
  if (!isObject(raw) || typeof raw["op"] !== "string" || !OPERATIONS.has(raw["op"])) {
    return undefined;
  }
  const { providerId, packageId } = raw;
  return {
    op: raw["op"] as OperationContext["op"],
    ...(isBoundedString(providerId) && { providerId }),
    ...(isBoundedString(packageId) && { packageId }),
  };
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}
