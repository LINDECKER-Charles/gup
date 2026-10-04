import { INSTALL_TIMEOUT_BOUNDS } from "../../../core/config/install-section.js";
import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../../core/runner.js";
import { TIMEOUT_DIALOG } from "../../text/menu-labels.js";
import {
  FILTER_VIEW,
  OPTION_HINTS,
  OPTION_LABELS,
  OPTIONS_SECTIONS,
  TIMEOUT_LABELS,
  TIMEOUT_VALUE,
} from "../../text/settings/options-labels.js";
import { seg } from "../../tui/styled-lines.js";
import type { OptionRow, OptionsControls, OptionsHost, SectionFactory } from "./option-row.js";
import { choiceRow, switchChoices } from "./option-rows.js";
import { ProviderFilter } from "./views/provider-filter.js";

/**
 * SCAN & INSTALL: fast mode, install timeout, provider filter. Each
 * change applies to the session at once and is saved; the two scan settings
 * change what a scan finds, so the panel then offers `r` to rescan.
 */
export const scanSection: SectionFactory = (controls, host) => {
  const rows = [fastRow(controls, host), timeoutRow(controls, host), filterRow(controls, host)];
  return { id: "scan", title: OPTIONS_SECTIONS.scan, rows: () => rows };
};

function fastRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  return choiceRow({
    id: "fast",
    label: OPTION_LABELS.fast,
    choices: switchChoices(),
    hint: OPTION_HINTS.fast,
    read: () => host.state.fast,
    write: (isFast) => {
      host.state.fast = isFast;
      controls.scanSettingsChanged();
      controls.save(() => host.settings.update("scan", { fast: isFast }));
    },
  });
}

function timeoutRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  return {
    id: "timeout",
    label: OPTION_LABELS.timeout,
    value: () => TIMEOUT_VALUE(getInstallTimeoutSeconds()),
    hint: () => [seg(OPTION_HINTS.timeout, "muted")],
    isEnabled: () => true,
    activate: () => void editTimeout(controls, host),
  };
}

function filterRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  const filter = new ProviderFilter({
    state: host.state,
    changed: (providerFilter) => {
      controls.scanSettingsChanged();
      controls.save(() => host.settings.update("scan", { providerFilter }));
    },
    close: () => controls.close(),
  });
  return {
    id: "filter",
    label: OPTION_LABELS.filter,
    value: () => FILTER_VIEW.value(host.state.filter.length),
    hint: () => [seg(OPTION_HINTS.filter, "muted")],
    isEnabled: () => true,
    activate: () => controls.open(filter),
  };
}

/** The effective timeout now (the session's), then saved for the next runs. */
async function editTimeout(controls: OptionsControls, host: OptionsHost): Promise<void> {
  const answer = await host.dialogs.ask({
    title: TIMEOUT_DIALOG.title,
    text: [TIMEOUT_DIALOG.text],
    default: String(getInstallTimeoutSeconds()),
    validate: validTimeout,
  });
  if (answer !== undefined) {
    const timeoutSeconds = Number(answer);
    setInstallTimeoutSeconds(timeoutSeconds);
    controls.save(() => host.settings.update("install", { timeoutSeconds }));
  }
  host.redraw();
}

/** A whole number of seconds the settings file can keep (0 turns the cap off). */
function validTimeout(value: string): true | string {
  const seconds = Number(value);
  if (value === "" || !Number.isFinite(seconds) || seconds < 0) return TIMEOUT_DIALOG.invalid;
  if (!Number.isInteger(seconds) || seconds > INSTALL_TIMEOUT_BOUNDS.max) {
    return TIMEOUT_LABELS.outOfRange;
  }
  return true;
}
