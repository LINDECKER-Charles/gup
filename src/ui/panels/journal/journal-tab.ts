import type { ChartGlyphs } from "../../charts/chart-glyphs.js";
import { EMPTY_ACTIVITY } from "../../text/activity-labels.js";
import { JOURNAL_HINTS, JOURNAL_LABELS } from "../../text/journal-labels.js";
import type { KeyPress } from "../../tui/screen-host.js";
import { fillLine, seg, wrap, type Line } from "../../tui/styled-lines.js";
import { placeholder } from "../panel.js";
import type { BrowsableList } from "./browsable-list.js";
import type { JournalData, JournalHistory } from "./journal-source.js";

/**
 * What a tab of the journal is to its panel, and the drawing helpers the
 * tabs share: the notices about the history (unreadable, empty, recording
 * off), a list window with its cursor row, the typed filter line.
 */

/** Where and how a tab draws. */
export interface TabFrame {
  readonly width: number;
  readonly height: number;
  readonly glyphs: ChartGlyphs;
  readonly now: Date;
}

export interface JournalTab {
  /** True while the tab takes every key: a filter being typed, a detail open. */
  readonly isModal: boolean;
  readonly isCapturingText: boolean;
  setData(data: JournalData): void;
  render(frame: TabFrame): Line[];
  /** True when the key was the tab's. */
  press(key: KeyPress): boolean;
  click(row: number, frame: TabFrame): void;
  scroll(step: number): void;
  hints(): string;
}

/** Left margin holding the cursor marker, so the cursor shows without colours. */
export const CURSOR_GUTTER = 2;

/**
 * What the history tabs show instead of their content: the read error, or an
 * empty period with the way to widen it — unless it already covers the whole
 * history. Null when there is content.
 */
export function historyPlaceholder(history: JournalHistory): Line[] | null {
  if (history.error !== undefined) return placeholder(JOURNAL_LABELS.unreadable(history.error));
  const { totals, period } = history.insights;
  if (totals.attempts > 0 || totals.scans > 0) return null;
  if (period.since === null) return placeholder(EMPTY_ACTIVITY);
  return [...placeholder(EMPTY_ACTIVITY), [seg(`  ${JOURNAL_LABELS.widenHint}`, "muted")]];
}

/** The banner above a history tab while recording is off, wrapped to the width. */
export function recordingBanner(history: JournalHistory, width: number): Line[] {
  if (!history.isRecordingOff) return [];
  return wrap(JOURNAL_LABELS.recordingOff, width).map((line): Line => [seg(line, "warning")]);
}

/** The rows of a list that fit `height`, the cursor's marked and highlighted. */
export function listWindow<T>(
  list: BrowsableList<T>,
  row: (item: T, width: number) => Line,
  frame: Pick<TabFrame, "width" | "height">,
): Line[] {
  const { start, end } = list.window(frame.height);
  return list.visible.slice(start, end).map((item, offset) => {
    const isCursor = start + offset === list.cursor;
    const marker = seg(isCursor ? "› " : "  ", "accent");
    const line: Line = [marker, ...row(item, frame.width - CURSOR_GUTTER)];
    return isCursor ? fillLine(line, frame.width, "highlight") : line;
  });
}

/** The filter line while typing or once a filter is set; none otherwise. */
export function filterLine<T>(list: BrowsableList<T>): Line[] {
  if (!list.isTyping && list.filter === "") return [];
  return [[seg("/ ", "accent"), seg(`${list.filter}${list.isTyping ? "█" : ""}`, "strong")]];
}

/** The key hints of a list tab: typing, detail, or its own. */
export function listHints<T>(list: BrowsableList<T>, own: string): string {
  if (list.isTyping) return JOURNAL_HINTS.typing;
  return list.isDetailOpen ? JOURNAL_HINTS.detail : own;
}

/** The value after `current` in `values`, the first one after the last. */
export function nextOf<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length] ?? current;
}

/** A click on content row `row` moves the cursor to the item drawn there. */
export function clickRow<T>(list: BrowsableList<T>, row: number, height: number): void {
  if (list.isModal || row < 0) return;
  const { start, end } = list.window(height);
  if (start + row < end) list.moveTo(start + row);
}
