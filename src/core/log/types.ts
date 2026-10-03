import type { OperationContext } from "../state/run-context.js";
import { LOG_THRESHOLDS, type LogLevel, type LogThreshold } from "./log.js";

/**
 * The debug log's on-disk format: one JSON object per line (JSONL), written
 * by the log backend, read back by `gup log`, the diagnostic archive and the
 * parent of an elevated batch. Fields are additive: a reader drops what it
 * does not know, and `v` changes only when a field changes meaning.
 */

export const LOG_SCHEMA_VERSION = 1;

/** Least verbose first: a level's index is its rank. */
export const LOG_LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug", "trace"];

export const MAX_EVENT_LENGTH = 48;
const EVENT_CHARS = /^[a-z0-9.-]+$/;

/** A JSON value, as stored in a record's `data`. */
export type LogValue =
  | string
  | number
  | boolean
  | null
  | readonly LogValue[]
  | { readonly [key: string]: LogValue };

export type LogData = { readonly [key: string]: LogValue };

export interface LogRecord {
  readonly v: typeof LOG_SCHEMA_VERSION;
  /** ISO 8601, UTC, millisecond precision. */
  readonly ts: string;
  readonly level: LogLevel;
  readonly event: string;
  /** The id the history records of the same run carry. */
  readonly runId: string;
  readonly pid: number;
  /** The operation in flight when the line was written (which provider, which package). */
  readonly ctx?: OperationContext;
  readonly data?: LogData;
  /** Written by the elevated child and forwarded by its parent. */
  readonly elevated?: true;
}

/** Where serialised records go: a file, the elevated child's memory. */
export interface LogSink {
  /**
   * Append one serialised record (no trailing newline). A sink may drop it to
   * respect its cap; an I/O failure throws, and the backend stops using the sink.
   */
  write(line: string, level: LogLevel): void;
  close(): void;
}

/** `<domain>.<action>`: two or more dotted parts of `[a-z0-9-]`, 48 characters at most. */
export function isEventName(name: string): boolean {
  if (name.length > MAX_EVENT_LENGTH || !EVENT_CHARS.test(name)) return false;
  const parts = name.split(".");
  return parts.length >= 2 && !parts.includes("");
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

/** 0 for `error` … 4 for `trace`: a level is recorded when its rank ≤ the threshold's. */
export function levelRank(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

/** Whether a record of `level` passes `threshold`. */
export function isRecordedAt(level: LogLevel, threshold: LogThreshold): boolean {
  return threshold !== "off" && levelRank(level) <= levelRank(threshold);
}

/** `"Debug "` → `"debug"`; anything that is not a level nor "off" → null. */
export function parseThreshold(raw: string | undefined): LogThreshold | null {
  const value = raw?.trim().toLowerCase();
  return LOG_THRESHOLDS.find((threshold) => threshold === value) ?? null;
}
