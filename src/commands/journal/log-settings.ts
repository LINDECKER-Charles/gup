import { ADMIN_BATCH_COMMAND } from "../../core/elevation.js";
import type { LogThreshold } from "../../core/log/log.js";
import { isRecordedAt, parseThreshold } from "../../core/log/types.js";
import type { RunTrigger } from "../../core/state/run-context.js";

/**
 * How much the debug log records for this run, and where it writes. Pure:
 * the journal module resolves it once, before any command runs.
 *
 * Precedence: `--log-level` > `GUP_LOG_LEVEL` > the default (`info`). A
 * value of `GUP_LOG_LEVEL` that is not a level is ignored (and reported by
 * `gup doctor`) rather than failing every command. `off` is honoured exactly:
 * nothing is written at all.
 */

export type LogSource = "flag" | "env" | "default";

export interface LogSettings {
  readonly threshold: LogThreshold;
  readonly source: LogSource;
  /** `GUP_LOG_LEVEL` when it held something that is not a level. */
  readonly ignoredEnv?: string;
}

export interface LogSettingsInput {
  /** `--log-level`, already validated. */
  readonly flag?: LogThreshold | undefined;
  readonly env: NodeJS.ProcessEnv;
  readonly trigger?: RunTrigger | undefined;
}

/** Where the records of a command go: the log file, the elevated child's memory, nowhere. */
export type LogSinkKind = "file" | "memory" | "none";

const LOG_LEVEL_ENV = "GUP_LOG_LEVEL";
const DEFAULT_LOG_THRESHOLD: LogThreshold = "info";
/** The commands that read the log (`gup log …`) must not write to it. */
const LOG_COMMAND = "log";

export function resolveLogSettings(input: LogSettingsInput): LogSettings {
  const settings = requestedSettings(input);
  return input.trigger === "schedule" ? atLeastInfo(settings) : settings;
}

export function sinkKindFor(commandPath: string): LogSinkKind {
  if (commandPath === ADMIN_BATCH_COMMAND) return "memory";
  const isReadingTheLog = commandPath === LOG_COMMAND || commandPath.startsWith(`${LOG_COMMAND} `);
  return isReadingTheLog ? "none" : "file";
}

function requestedSettings({ flag, env }: LogSettingsInput): LogSettings {
  if (flag !== undefined) return { threshold: flag, source: "flag" };
  const raw = env[LOG_LEVEL_ENV];
  const fromEnv = parseThreshold(raw);
  if (fromEnv !== null) return { threshold: fromEnv, source: "env" };
  const ignored = raw?.trim();
  return {
    threshold: DEFAULT_LOG_THRESHOLD,
    source: "default",
    ...(ignored && { ignoredEnv: ignored }),
  };
}

/**
 * A scheduled run is unattended: its log is the only witness of what it did,
 * so a threshold quieter than `info` is raised to it. `off` stays off — that
 * is the user turning the log out, not tuning it.
 */
function atLeastInfo(settings: LogSettings): LogSettings {
  if (settings.threshold === "off" || isRecordedAt("info", settings.threshold)) return settings;
  return { ...settings, threshold: "info" };
}
