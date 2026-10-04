import { deferUntilExit } from "../process/output-router.js";
import { currentOperation, RUN_ID } from "../state/run-context.js";
import type { LogBackend, LogInput, LogLevel, LogThreshold } from "./log.js";
import { clip } from "./redact.js";
import { resanitizeRecord, sanitizeContext, sanitizeData } from "./sanitize-data.js";
import {
  isEventName,
  isRecordedAt,
  LOG_SCHEMA_VERSION,
  type LogRecord,
  type LogSink,
} from "./types.js";

/**
 * The debug log's backend behind the `log` facade: it filters by threshold,
 * stamps each record (time, run id, process id, the operation in flight),
 * sanitises its data, and hands the JSON line to a sink — a file, or the
 * elevated child's memory.
 *
 * It never throws and never prints while it runs: the first sink failure
 * turns it off for the rest of the process and queues one notice for the
 * process exit, when no full-screen app can be painted over.
 */

/** Recorded instead of a name that is not `<domain>.<action>`. */
const BAD_EVENT = "log.bad-event";
/** How much of a bad event name the record keeps. */
const MAX_BAD_EVENT_LENGTH = 256;
const FAILURE_NOTICE = "journal de debug non écrit";

export interface SinkLogBackendOptions {
  readonly threshold: LogThreshold;
  readonly sink: LogSink;
  readonly now?: () => Date;
}

/** One record as the sinks store it: what `emit` writes, and the sinks' own notices. */
export function formatLogLine(level: LogLevel, event: string, data?: LogInput): string {
  return JSON.stringify(buildRecord({ level, event, data }, new Date()));
}

export class SinkLogBackend implements LogBackend {
  #threshold: LogThreshold;
  #sink: LogSink | null;
  #failure: string | null = null;
  readonly #now: () => Date;

  constructor(options: SinkLogBackendOptions) {
    this.#threshold = options.threshold;
    this.#sink = options.sink;
    this.#now = options.now ?? (() => new Date());
  }

  isEnabled(level: LogLevel): boolean {
    return this.#sink !== null && isRecordedAt(level, this.#threshold);
  }

  emit(level: LogLevel, event: string, data: LogInput | undefined): void {
    if (!this.isEnabled(level)) return;
    this.#write(buildRecord({ level, event, data }, this.#now()));
  }

  /** An elevated child's record: its own time and pid, this run's id, marked elevated. */
  forward(record: LogRecord): void {
    if (!this.isEnabled(record.level)) return;
    this.#write({ ...resanitizeRecord(record), runId: RUN_ID, elevated: true });
  }

  setThreshold(threshold: LogThreshold): void {
    this.#threshold = threshold;
  }

  threshold(): LogThreshold {
    return this.#threshold;
  }

  /** Why the log stopped being written, or null while it is. */
  failure(): string | null {
    return this.#failure;
  }

  close(): void {
    try {
      this.#sink?.close();
    } catch {
      // Closing is best-effort, like every write.
    }
    this.#sink = null;
  }

  #write(record: LogRecord): void {
    try {
      this.#sink?.write(JSON.stringify(record), record.level);
    } catch (error) {
      this.#failure = error instanceof Error ? error.message : String(error);
      this.close();
      deferUntilExit(`${FAILURE_NOTICE} — ${this.#failure}`);
    }
  }
}

interface RecordInput {
  readonly level: LogLevel;
  readonly event: string;
  readonly data: LogInput | undefined;
}

function buildRecord({ level, event, data }: RecordInput, now: Date): LogRecord {
  const isNamed = isEventName(event);
  const sanitized = sanitizeData(
    isNamed ? data : { ...data, event: clip(event, MAX_BAD_EVENT_LENGTH) },
  );
  const operation = currentOperation();
  const ctx = operation && sanitizeContext(operation);
  return {
    v: LOG_SCHEMA_VERSION,
    ts: now.toISOString(),
    level,
    event: isNamed ? event : BAD_EVENT,
    runId: RUN_ID,
    pid: process.pid,
    ...(ctx && { ctx }),
    ...(sanitized && { data: sanitized }),
  };
}
