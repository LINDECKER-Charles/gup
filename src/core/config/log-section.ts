import { LOG_THRESHOLDS, type LogThreshold } from "../log/log.js";
import { defineSection } from "./section.js";

/**
 * The `log` section: how much the debug log records when neither
 * `--log-level` nor `GUP_LOG_LEVEL` says otherwise. The elevated child never
 * reads it — its parent passes the threshold in the batch payload.
 */

export interface DebugLogSettings {
  /** The least severe level recorded, or "off". */
  readonly level: LogThreshold;
}

const DEFAULTS: DebugLogSettings = Object.freeze({ level: "info" });

export const LOG_SECTION = defineSection<DebugLogSettings>({
  key: "log",
  version: 1,
  defaults: DEFAULTS,
  parse: (read) => ({ level: read.oneOf("level", LOG_THRESHOLDS, DEFAULTS.level) }),
});
