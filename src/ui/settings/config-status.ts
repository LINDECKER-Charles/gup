import type { ConfigStatus } from "../../core/config/store.js";
import { CONFIG_STATE_LABELS, invalidSettingsLabel } from "../text/settings-labels.js";

/**
 * The settings file's state in one line, and how worrying it is: what
 * `gup doctor` prints and the Options view's file row shows.
 */
export interface ConfigStatusLine {
  readonly text: string;
  readonly level: "ok" | "warn" | "off";
}

/** The worst news first: a failed save, then the file's state, then invalid fields. */
export function describeConfigStatus(status: ConfigStatus): ConfigStatusLine {
  const state = stateLine(status);
  if (state.level !== "ok" || status.issues.length === 0) return state;
  return { text: invalidSettingsLabel(status.issues), level: "warn" };
}

function stateLine(status: ConfigStatus): ConfigStatusLine {
  if (status.lastWriteError !== undefined) {
    return { text: CONFIG_STATE_LABELS.notSaved(status.lastWriteError), level: "warn" };
  }
  switch (status.state) {
    case "disabled":
      return { text: CONFIG_STATE_LABELS.disabled, level: "off" };
    case "unavailable":
      return { text: CONFIG_STATE_LABELS.unavailable, level: "warn" };
    case "missing":
      return { text: CONFIG_STATE_LABELS.defaults, level: "ok" };
    case "recovered":
      return { text: CONFIG_STATE_LABELS.recovered(status.backup ?? ""), level: "warn" };
    case "loaded":
      return status.readOnlySections.length > 0
        ? { text: CONFIG_STATE_LABELS.readOnly, level: "warn" }
        : { text: CONFIG_STATE_LABELS.saved, level: "ok" };
  }
}
