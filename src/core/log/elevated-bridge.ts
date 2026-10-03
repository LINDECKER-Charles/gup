import { forwardLogRecord, type LogLevel } from "./log.js";
import { formatLogLine } from "./log-backend.js";
import { parseLogLine } from "./log-reader.js";
import type { LogSink } from "./types.js";

/**
 * How the elevated `__admin-batch` child's log reaches the user's log file.
 *
 * The child never writes into the logs directory: that directory belongs to
 * the unelevated user, and an elevated append into a path that user controls
 * (a planted junction or symlink) is a classic write primitive (CWE-59). The
 * child keeps its records in memory ({@link elevatedLogBuffer}), returns them
 * inside the batch output next to the outcomes, and the parent validates them
 * line by line before writing them as its own — exactly like the history.
 * Both sides bound the volume, so a runaway child cannot balloon the IPC file
 * nor the parent's log.
 */

export const MAX_FORWARDED_LINES = 1000;
export const MAX_FORWARDED_BYTES = 512 * 1024;
/** Room kept for the record that says the cap was reached. */
const NOTICE_RESERVE_BYTES = 1024;

export interface MemorySinkOptions {
  /** The record kept once, when the cap drops the first line. */
  readonly cappedLine?: () => string;
}

/** Records kept in memory up to the forwarding caps, then dropped. */
export class MemorySink implements LogSink {
  #lines: string[] = [];
  #bytes = 0;
  #isCapped = false;
  readonly #cappedLine: (() => string) | undefined;

  constructor(options: MemorySinkOptions = {}) {
    this.#cappedLine = options.cappedLine;
  }

  write(line: string, _level: LogLevel): void {
    if (this.#isCapped) return;
    const bytes = Buffer.byteLength(line);
    const hasRoom =
      this.#lines.length < MAX_FORWARDED_LINES - 1 &&
      this.#bytes + bytes <= MAX_FORWARDED_BYTES - NOTICE_RESERVE_BYTES;
    if (hasRoom) {
      this.#lines.push(line);
      this.#bytes += bytes;
      return;
    }
    this.#isCapped = true;
    const notice = this.#cappedLine?.();
    if (notice !== undefined && Buffer.byteLength(notice) <= NOTICE_RESERVE_BYTES) {
      this.#lines.push(notice);
    }
  }

  close(): void {
    // Nothing to release: the records wait for drain().
  }

  /** Every record kept so far, oldest first; the sink starts empty again. */
  drain(): string[] {
    const lines = this.#lines;
    this.#lines = [];
    this.#bytes = 0;
    this.#isCapped = false;
    return lines;
  }
}

/**
 * The elevated child's log: the journal module points the child's backend at
 * it, `__admin-batch` drains it into the batch output. Empty when nothing logs.
 */
export const elevatedLogBuffer = new MemorySink({
  cappedLine: () =>
    formatLogLine("warn", "log.capped", { lines: MAX_FORWARDED_LINES, bytes: MAX_FORWARDED_BYTES }),
});

/**
 * Parent side: the `log` field of the batch output, written to this process's
 * log. Anything that is not a well-formed record is dropped; the caps apply
 * again. Never throws, never changes what the outcomes say.
 */
export function ingestElevatedLines(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  let remainingBytes = MAX_FORWARDED_BYTES;
  for (const line of raw.slice(0, MAX_FORWARDED_LINES)) {
    if (typeof line !== "string") continue;
    remainingBytes -= Buffer.byteLength(line);
    if (remainingBytes < 0) return;
    const record = parseLogLine(line);
    if (record) forwardLogRecord(record);
  }
}
