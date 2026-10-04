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
import { seg, shownPath, type Line, type Tone } from "../../tui/styled-lines.js";
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
    hint: (room) => fileHint(host.settings.status(), room),
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

/** Between the file's state and its path. */
const PATH_GAP = "  ";
/** Fewer columns left for the path on its row: the line under the list shows it instead. */
const MIN_PATH_WIDTH = 12;

/**
 * The file's state — a failed save first, until a later one succeeds — then
 * its path from `~`, cut in its middle to the `room` of its row.
 */
function fileHint(status: ConfigStatus, room = Number.POSITIVE_INFINITY): Line {
  const { text, level } = describeConfigStatus(status);
  const state = seg(text, LEVEL_TONE[level]);
  const pathRoom = room - text.length - PATH_GAP.length;
  if (status.file === null || pathRoom < MIN_PATH_WIDTH) return [state];
  return [state, seg(`${PATH_GAP}${shownPath(status.file, pathRoom)}`, "muted")];
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
