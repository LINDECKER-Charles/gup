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

/** Columns kept blank between the count and the launch button. */
const BUTTON_GAP = 1;

/**
 * The foot of the package table, always on screen: guidance rows, then the
 * bar — how many packages are checked and, once one is, the launch button on
 * the right. The bar's row is the last one; clicking it is pressing Entrée.
 */
export function selectionBar(state: SelectionBarState, width: number): Line[] {
  return [...guidanceLines(state, width), barLine(state, width)];
}

/**
 * The rows above the bar: the notice of a refused key, word-wrapped; else,
 * while nothing is checked and the bar is too narrow to say it, how to
 * check; else one blank row, so the table does not move when a notice comes.
 */
function guidanceLines(state: SelectionBarState, width: number): Line[] {
  const notice = wrap(state.notice ?? "", width).map((text): Line => [seg(text, "warning")]);
  if (notice.length > 0) return notice;
  if (state.checked === 0 && !isEmptyMessageFitting(width)) {
    return [[seg(fit(SELECTION_BAR.howToCheck, width).trimEnd(), "muted")]];
  }
  return [[]];
}

/**
 * The count, then the launch button at the right edge. A bar too narrow for
 * both drops the number from the button before cutting the count: the count
 * right beside it already says how many.
 */
function barLine(state: SelectionBarState, width: number): Line {
  if (state.checked === 0) return emptyBarLine(width);
  const count = SELECTION_BAR.count(state.checked, state.total);
  const full = launchButton(SELECTION_BAR.button(state.checked), state.canLaunch);
  const isRoomy = count.length + BUTTON_GAP + lineWidth(full) <= width;
  const button = isRoomy ? full : launchButton(SELECTION_BAR.buttonShort, state.canLaunch);
  const room = Math.max(0, width - lineWidth(button) - BUTTON_GAP);
  return [seg(fit(count, room), "success"), seg(" ".repeat(BUTTON_GAP)), ...button];
}

function emptyBarLine(width: number): Line {
  const { empty, nothingChecked } = SELECTION_BAR;
  const message = isEmptyMessageFitting(width) ? empty : nothingChecked;
  return [seg(fit(message, width).trimEnd(), "muted")];
}

function isEmptyMessageFitting(width: number): boolean {
  return SELECTION_BAR.empty.length <= width;
}

/**
 * `label` between half blocks: a filled button that still reads as one
 * without colours (the edges stay), drawn inert while it cannot be pressed.
 */
function launchButton(label: string, canLaunch: boolean): Line {
  const { buttonStart, buttonEnd } = SELECTION_BAR;
  if (!canLaunch) return [seg(`${buttonStart}${label}${buttonEnd}`, "disabled")];
  return [seg(buttonStart, "accent"), seg(label, "onAccent", "accent"), seg(buttonEnd, "accent")];
}
