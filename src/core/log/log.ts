/**
 * The logging facade every module writes to. It does nothing until a backend
 * is installed (by a CLI module's startup hook): library code, tests and the
 * builds without a log backend pay one null check per call.
 *
 * Events are named `<domain>.<action>` — lowercase letters, digits, dots and
 * dashes, at most 48 characters (`scan.ownership-excluded`). The data is a
 * flat bag of facts; the backend stamps the time, the run id, the process id
 * and the current operation (`core/state/run-context.ts`), and redacts.
 */

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** The least severe level recorded, or "off". */
export type LogThreshold = LogLevel | "off";

export const LOG_THRESHOLDS: readonly LogThreshold[] = [
  "off",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
];

/** Most verbose first: the first one a backend records is its threshold. */
const LEVELS_BY_VERBOSITY: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error"];

export type LogInput = { readonly [key: string]: unknown };

export interface Logger {
  error(event: string, data?: LogInput): void;
  warn(event: string, data?: LogInput): void;
  info(event: string, data?: LogInput): void;
  debug(event: string, data?: LogInput): void;
  trace(event: string, data?: LogInput): void;
  /** Whether `level` is recorded: guard work done only to build log data. */
  isEnabled(level: LogLevel): boolean;
}

export interface LogBackend {
  isEnabled(level: LogLevel): boolean;
  /** Must not throw. */
  emit(level: LogLevel, event: string, data: LogInput | undefined): void;
  /** Record from `threshold` on. Optional: a fixed backend ignores it. */
  setThreshold?(threshold: LogThreshold): void;
}

let backend: LogBackend | null = null;

/** Install the process-wide backend; null puts the facade back to a no-op. */
export function installLogBackend(next: LogBackend | null): void {
  backend = next;
}

/**
 * The threshold in effect: the most verbose level the backend records, "off"
 * without a backend. The parent hands it to the elevated child, which never
 * reads the user's settings.
 */
export function effectiveLogThreshold(): LogThreshold {
  return LEVELS_BY_VERBOSITY.find((level) => isEnabled(level)) ?? "off";
}

/** Ask the backend to record from `threshold` on — the elevated child adopting its parent's. */
export function applyLogThreshold(threshold: LogThreshold): void {
  try {
    backend?.setThreshold?.(threshold);
  } catch {
    // Same contract as every logging call: never a reason to fail.
  }
}

function isEnabled(level: LogLevel): boolean {
  try {
    return backend?.isEnabled(level) ?? false;
  } catch {
    return false;
  }
}

function emit(level: LogLevel, event: string, data: LogInput | undefined): void {
  if (!backend || !isEnabled(level)) return;
  try {
    backend.emit(level, event, data);
  } catch {
    // A log line is never worth a failed scan or update.
  }
}

export const log: Logger = {
  error: (event, data) => emit("error", event, data),
  warn: (event, data) => emit("warn", event, data),
  info: (event, data) => emit("info", event, data),
  debug: (event, data) => emit("debug", event, data),
  trace: (event, data) => emit("trace", event, data),
  isEnabled,
};
