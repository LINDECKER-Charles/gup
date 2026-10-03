import { SELECTION_BAR } from "../text/packages-labels.js";
import { fit, lineWidth, seg, wrap, type Line } from "../tui/styled-lines.js";

/** What the foot of the package table reports. */
export interface SelectionBarState {
  /** Checked packages, those the filter hides included: what Entrée updates. */
  readonly checked: number;
  /** Every package of the table, filter or not. */
  readonly total: number;
  /** False while an update cannot start (a scan runs): the button is drawn inert. */
  readonly canLaunch: boolean;
  /** Why the last key did nothing, shown above the bar until the next key. */
  readonly notice: string | null;
}

/**
 * The foot of the package table, always on screen: a row for the notice of a
 * refused key (blank otherwise), then the bar — how many packages are checked
 * and, once one is, the launch button on the right. The bar's row is the
 * last one; clicking it is pressing Entrée.
 */
export function selectionBar(state: SelectionBarState, width: number): Line[] {
  const notice = state.notice ? wrap(state.notice, width).map((text) => [seg(text, "warning")]) : [];
  return [...(notice.length > 0 ? notice : [[]]), barLine(state, width)];
}

function barLine(state: SelectionBarState, width: number): Line {
  if (state.checked === 0) return [seg(emptyMessage(width), "muted")];
  const button = launchButton(state);
  const room = Math.max(0, width - lineWidth(button));
  return [seg(fit(SELECTION_BAR.count(state.checked, state.total), room), "success"), ...button];
}

/** How to check packages, or only that none is when the bar is too narrow to say it. */
function emptyMessage(width: number): string {
  const { empty, emptyShort } = SELECTION_BAR;
  return fit(empty.length <= width ? empty : emptyShort, width).trimEnd();
}

/**
 * ` Entrée  Mettre à jour (n) ` between half blocks: a filled button that
 * still reads as one without colours (the edges stay), drawn inert while it
 * cannot be pressed.
 */
function launchButton({ checked, canLaunch }: SelectionBarState): Line {
  const { buttonStart, buttonEnd } = SELECTION_BAR;
  const label = SELECTION_BAR.button(checked);
  if (!canLaunch) return [seg(`${buttonStart}${label}${buttonEnd}`, "disabled")];
  return [seg(buttonStart, "accent"), seg(label, "onAccent", "accent"), seg(buttonEnd, "accent")];
}
