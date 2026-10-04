import type { ConfigStatus } from "../../../core/config/store.js";
import { describeConfigStatus, type ConfigStatusLine } from "../../settings/config-status.js";
import {
  OPTION_HINTS,
  OPTION_LABELS,
  OPTIONS_HINTS,
  OPTIONS_NOTICES,
  OPTIONS_SECTIONS,
  RESET_DIALOG,
  type ResetScope,
} from "../../text/settings/options-labels.js";
import { seg, type Line, type Tone } from "../../tui/styled-lines.js";
import type { OptionRow, OptionsControls, OptionsHost, SectionFactory } from "./option-row.js";
import { resetSettings, touchesScan } from "./reset-settings.js";

/**
 * FICHIER: reset a group of settings (chosen, then confirmed, "Non" by
 * default), and the settings file — its state and where it lives, the path
 * copied to the clipboard with `c` (or Entrée on its row).
 */
export const fileSection: SectionFactory = (controls, host) => {
  const copyPath = (): void => copyFilePath(controls, host);
  const reset: OptionRow = {
    id: "reset",
    label: OPTION_LABELS.reset,
    value: () => "",
    hint: () => [seg(OPTION_HINTS.reset, "muted")],
    isEnabled: () => true,
    activate: () => void chooseReset(controls, host),
  };
  const file: OptionRow = {
    id: "file",
    label: OPTION_LABELS.file,
    value: () => "",
    hint: () => fileHint(host.settings.status()),
    isEnabled: () => true,
    activate: copyPath,
  };
  return {
    id: "file",
    title: OPTIONS_SECTIONS.file,
    rows: () => [reset, file],
    shortcuts: () => [{ key: "c", hint: OPTIONS_HINTS.copy, run: copyPath }],
  };
};

const LEVEL_TONE: Readonly<Record<ConfigStatusLine["level"], Tone>> = {
  ok: "success",
  warn: "warning",
  off: "muted",
};

/** The file's state — a failed save first, until a later one succeeds — then its path. */
function fileHint(status: ConfigStatus): Line {
  const { text, level } = describeConfigStatus(status);
  const state = seg(text, LEVEL_TONE[level]);
  return status.file === null ? [state] : [state, seg(`  ${status.file}`, "muted")];
}

function copyFilePath(controls: OptionsControls, host: OptionsHost): void {
  const { file } = host.settings.status();
  if (file === null) return;
  const isCopied = host.copyToClipboard(file);
  controls.notify(
    isCopied
      ? [seg(OPTIONS_NOTICES.copied, "success")]
      : [seg(OPTIONS_NOTICES.copyFailed, "warning")],
  );
}

const SCOPES: readonly ResetScope[] = ["appearance", "comfort", "scan", "all"];

async function chooseReset(controls: OptionsControls, host: OptionsHost): Promise<void> {
  const scope = await host.dialogs.choose<ResetScope>({
    title: RESET_DIALOG.title,
    choices: SCOPES.map((value) => ({ value, ...RESET_DIALOG.scopes[value] })),
  });
  const isConfirmed =
    scope !== undefined &&
    (await host.dialogs.confirm({
      title: RESET_DIALOG.title,
      text: [RESET_DIALOG.confirm(RESET_DIALOG.scopes[scope].label)],
      default: false,
    }));
  if (scope !== undefined && isConfirmed) {
    controls.save(() => resetSettings(scope, host));
    if (touchesScan(scope)) controls.scanSettingsChanged();
  }
  host.redraw();
}
