import type { ErasureOutcome, SharingState } from "../../core/feedback/sharing-state.js";
import type { OptionRow, OptionsControls, SectionFactory } from "../panels/options/option-row.js";
import { choiceRow, switchChoices } from "../panels/options/option-rows.js";
import { FEEDBACK_CLI_LABELS } from "../text/feedback/feedback-cli-labels.js";
import { FEEDBACK_MENU_LABELS as LABELS } from "../text/feedback/feedback-menu-labels.js";
import { seg, type Line } from "../tui/styled-lines.js";

/**
 * FEEDBACK, the Options row that shares the journals or stops: the same
 * switch as `gup feedback share on|off`, with the install ID beside it.
 * Turning it off erases what was shared, in the background; the outcome
 * shows above the list. Under `GUP_SHARE_LOGS=0` the row is disabled and
 * says why.
 */

export interface SharingOptionsPort {
  state(): SharingState;
  /** Read only: the hint never creates the ID. */
  installId(): string | null;
  /** Save the decision (throws when it cannot be saved). */
  decide(decision: "granted" | "denied"): void;
  /** Never rejects. */
  erase(): Promise<ErasureOutcome>;
}

export function sharingOptions(port: SharingOptionsPort): SectionFactory {
  return (controls, host) => {
    const rows = [shareRow(port, controls, () => host.redraw())];
    return { id: "feedback", title: LABELS.optionsTitle, rows: () => rows };
  };
}

function shareRow(
  port: SharingOptionsPort,
  controls: OptionsControls,
  redraw: () => void,
): OptionRow {
  const row = choiceRow({
    id: "shareJournals",
    label: LABELS.shareLabel,
    choices: switchChoices(),
    hint: "",
    read: () => port.state() === "granted",
    write: (isShared) => {
      const isSaved = controls.save(() => port.decide(isShared ? "granted" : "denied"));
      if (isSaved && !isShared) eraseInBackground(port, controls, redraw);
    },
  });
  return {
    ...row,
    hint: () => shareHint(port),
    isEnabled: () => port.state() !== "forced-off",
  };
}

function shareHint(port: SharingOptionsPort): Line {
  if (port.state() === "forced-off") return [seg(LABELS.forcedOff, "warning")];
  const installId = port.installId();
  return [seg(installId === null ? LABELS.shareHintNoId : LABELS.shareHint(installId), "muted")];
}

function eraseInBackground(
  port: SharingOptionsPort,
  controls: OptionsControls,
  redraw: () => void,
): void {
  controls.notify([seg(LABELS.erasing, "muted")]);
  void port.erase().then((outcome) => {
    const tone = outcome === "failed" ? "warning" : "success";
    controls.notify([seg(FEEDBACK_CLI_LABELS.erasure[outcome], tone)]);
    redraw();
  });
}
