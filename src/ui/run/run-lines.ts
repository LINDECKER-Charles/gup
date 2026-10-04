import {
  PANE_LABELS,
  RUN_FACTS,
  RUN_MESSAGES,
  RUN_SUMMARY,
  RUN_TAGS,
  RUN_TITLES,
  waitingMessage,
  type ElevationKind,
} from "../text/run-labels.js";
import { formatClock } from "../text/fr-format.js";
import { STATUS_GLYPHS } from "../theme/glyphs.js";
import {
  fit,
  lineWidth,
  middleEllipsis,
  seg,
  type Line,
  type Segment,
  type Tone,
} from "../tui/styled-lines.js";
import {
  retryLabelOf,
  type ItemState,
  type RunCounts,
  type RunItem,
  type RunModel,
} from "./run-model.js";

/** A short message under the header until the next key. */
export interface Notice {
  readonly text: string;
  readonly tone: Tone;
}

/** How the status list is drawn this frame. */
export interface StatusView {
  /** Content columns and rows of the status panel. */
  readonly width: number;
  readonly rows: number;
  /** The package kept in view: the one in flight, or the one the user moved to. */
  readonly focus: number | null;
  /** Results: the selected package, drawn with a marker. */
  readonly cursor: number | null;
  /** Spinner frame. */
  readonly frame: number;
  /** Clock time of this frame (the waiting line's "commencée il y a…"). */
  readonly now: number;
  readonly elevation: ElevationKind;
  readonly notice: Notice | null;
  /** The prompt hint, under the package in flight. */
  readonly promptHint: string | null;
  readonly isEnlarged: boolean;
}

/** The lines, and which package each line belongs to (for clicks). */
export interface StatusLines {
  readonly lines: readonly Line[];
  readonly rowItems: readonly (number | null)[];
}

/** Rows above the packages: the header, then a notice or a blank row. */
const TOP_ROWS = 2;
const GAP = "   ";
const COLUMN_GAP = "  ";
const CURSOR = "› ";
const NO_CURSOR = "  ";
const MIN_BAR = 10;
const MAX_BAR = 40;
const LABEL_SHARE = 0.3;
const MIN_LABEL = 12;
const MAX_LABEL = 32;
const MAX_PROVIDER = 16;

const ICON: Readonly<Record<ItemState, { readonly glyph: string; readonly tone: Tone }>> = {
  pending: { glyph: STATUS_GLYPHS.pending, tone: "muted" },
  running: { glyph: "", tone: "accent" },
  elevating: { glyph: "", tone: "accent" },
  succeeded: { glyph: STATUS_GLYPHS.success, tone: "success" },
  skipped: { glyph: STATUS_GLYPHS.skipped, tone: "warning" },
  failed: { glyph: STATUS_GLYPHS.failed, tone: "danger" },
  cancelled: { glyph: STATUS_GLYPHS.cancelled, tone: "muted" },
};

/** What every row of one frame shares. */
interface Rows {
  readonly model: RunModel;
  readonly view: StatusView;
  readonly label: number;
  readonly provider: number;
  /** The package in flight (the first one of the elevated batch), or -1. */
  readonly current: number;
}

/** The status panel's title: running, stop requested, or over. */
export function runTitle(model: RunModel): string {
  if (model.phase === "done") return RUN_TITLES.done;
  return model.isStopping ? RUN_TITLES.stopping : RUN_TITLES.running;
}

/**
 * The title bar's facts: "Mise à jour · 2/5 · 01:12" while it runs, then
 * "Mise à jour terminée · 5 paquet(s) · 03:12".
 */
export function runFacts(model: RunModel): string[] {
  const { done, total } = model.counts();
  const clock = formatClock(model.elapsedMs());
  if (model.phase === "done") return [RUN_FACTS.done, RUN_FACTS.total(total), clock];
  return [RUN_FACTS.running, `${done}/${total}`, clock];
}

/** The terminal frame's title on the results: whose output it keeps. */
export function outputTitle(item: RunItem | undefined, elevation: ElevationKind): string {
  if (!item) return "";
  const title = item.isAdmin
    ? PANE_LABELS.admin[elevation]
    : PANE_LABELS.title(item.providerName, item.label);
  return PANE_LABELS.output(title);
}

/** Content rows the status list would need to show every package. */
export function wantedStatusRows(model: RunModel, view: StatusView): number {
  const rows = rowsOf(model, view);
  const blocks = model.items.map((item, index) => block(rows, item, index));
  return TOP_ROWS + blocks.reduce((sum, lines) => sum + lines.length, 0);
}

/** The status list: the header, a notice (or a blank row), then the packages in view. */
export function statusLines(model: RunModel, view: StatusView): StatusLines {
  const rows = rowsOf(model, view);
  const header = headerLine(model, view);
  if (view.isEnlarged) return enlargedLines(rows, header);
  const top: Line[] = [header, view.notice ? noticeLine(view.notice, view.width) : []];
  const blocks = model.items.map((item, index) => block(rows, item, index));
  const { start, end } = windowAround(blocks, view.focus ?? 0, view.rows - top.length);
  const lines = [...top];
  const rowItems: (number | null)[] = top.map(() => null);
  blocks.slice(start, end).forEach((blockLines, offset) => {
    for (const line of blockLines) {
      lines.push(line);
      rowItems.push(start + offset);
    }
  });
  return { lines, rowItems };
}

function rowsOf(model: RunModel, view: StatusView): Rows {
  const longest = (pick: (item: RunItem) => string): number =>
    Math.max(0, ...model.items.map((item) => pick(item).length));
  const share = Math.min(MAX_LABEL, Math.floor(view.width * LABEL_SHARE));
  const { current } = model;
  return {
    model,
    view,
    label: Math.max(MIN_LABEL, Math.min(share, longest((item) => item.label))),
    provider: Math.min(MAX_PROVIDER, longest((item) => item.providerName)),
    current: current ? model.items.indexOf(current) : -1,
  };
}

function enlargedLines(rows: Rows, header: Line): StatusLines {
  const { model, view } = rows;
  const top = view.notice ? noticeLine(view.notice, view.width) : header;
  const focus = view.focus ?? 0;
  const item = model.items[focus];
  if (!item) return { lines: [top], rowItems: [null] };
  return { lines: [top, itemRow(rows, item, focus)], rowItems: [null, focus] };
}

function headerLine(model: RunModel, view: StatusView): Line {
  const counts = model.counts();
  const clock = formatClock(model.elapsedMs());
  if (model.phase === "done") {
    return justify(summary(counts), [seg(RUN_SUMMARY.elapsed(clock), "muted")], view.width);
  }
  if (model.phase === "waiting") {
    return justify(waitingLine(model, view), [seg(clock, "muted")], view.width);
  }
  const counters = progressCounters(counts);
  const room = view.width - lineWidth(counters) - clock.length - GAP.length * 2;
  const bar = progressBar(counts, Math.max(MIN_BAR, Math.min(MAX_BAR, room)));
  return justify([...bar, seg(GAP), ...counters], [seg(clock, "muted")], view.width);
}

function progressBar(counts: RunCounts, width: number): Line {
  const filled = counts.total > 0 ? Math.round((counts.done / counts.total) * width) : 0;
  return [seg("█".repeat(filled), "accent"), seg("░".repeat(width - filled), "muted")];
}

function progressCounters(counts: RunCounts): Line {
  return [
    seg(`${counts.done}/${counts.total}`, "strong"),
    seg(GAP),
    counter(`${STATUS_GLYPHS.success} ${counts.succeeded}`, counts.succeeded, "success"),
    seg(GAP),
    counter(`${STATUS_GLYPHS.skipped} ${counts.skipped}`, counts.skipped, "warning"),
    seg(GAP),
    counter(`${STATUS_GLYPHS.failed} ${counts.failed}`, counts.failed, "danger"),
    ...(counts.cancelled > 0
      ? [seg(GAP), seg(`${STATUS_GLYPHS.cancelled} ${counts.cancelled}`, "muted")]
      : []),
  ];
}

function summary(counts: RunCounts): Line {
  const { succeeded, skipped, failed } = counts;
  const parts: Segment[] = [
    counter(`${STATUS_GLYPHS.success} ${RUN_SUMMARY.succeeded(succeeded)}`, succeeded, "success"),
    seg(GAP),
    counter(`${STATUS_GLYPHS.skipped} ${RUN_SUMMARY.skipped(skipped)}`, skipped, "warning"),
    seg(GAP),
    counter(`${STATUS_GLYPHS.failed} ${RUN_SUMMARY.failed(failed)}`, failed, "danger"),
  ];
  if (counts.cancelled === 0) return parts;
  const cancelled = `${STATUS_GLYPHS.cancelled} ${RUN_SUMMARY.cancelled(counts.cancelled)}`;
  return [...parts, seg(GAP), seg(cancelled, "muted")];
}

/** A count in its tone, muted at zero: no package updated is not a success to show in green. */
function counter(text: string, count: number, tone: Tone): Segment {
  return seg(text, count === 0 ? "muted" : tone);
}

function waitingLine(model: RunModel, view: StatusView): Line {
  const message = waitingMessage(model.holder, new Date(view.now));
  return [seg(`${spinner(view.frame)} `, "accent"), seg(message)];
}

/**
 * The notice in its one row, cut in its middle when it must be: what ends it
 * matters most — the file name of a report written by `o`, which the user
 * opens by hand when the browser could not.
 */
function noticeLine(notice: Notice, width: number): Line {
  return [seg(middleEllipsis(notice.text, width), notice.tone)];
}

/** One package: its row, the message under it, and the prompt hint under the one in flight. */
function block(rows: Rows, item: RunItem, index: number): Line[] {
  const { view } = rows;
  const lines = [itemRow(rows, item, index)];
  const message = messageOf(rows.model, item);
  const indent = view.cursor === null ? "" : NO_CURSOR;
  if (message) lines.push([seg(`${indent}  └ ${message}`, "muted")]);
  if (view.promptHint && index === rows.current) {
    lines.push([seg(`${indent}  ${view.promptHint}`, "warning", "highlight")]);
  }
  return lines;
}

function itemRow(rows: Rows, item: RunItem, index: number): Line {
  const { view } = rows;
  const mark = view.cursor === null ? "" : view.cursor === index ? CURSOR : NO_CURSOR;
  const left: Line = [
    seg(mark, "accent"),
    seg(`${iconOf(item, view.frame)} `, ICON[item.state].tone),
    seg(fit(item.label, rows.label), item.state === "running" ? "strong" : "plain"),
    seg(COLUMN_GAP),
    seg(fit(item.providerName, rows.provider), "muted"),
    seg(COLUMN_GAP),
    seg(versionsOf(item), "muted"),
  ];
  return justify(left, rightColumns(rows.model, item, view.elevation), view.width);
}

function rightColumns(model: RunModel, item: RunItem, elevation: ElevationKind): Line {
  const tag = tagOf(item, elevation);
  const duration = model.durationOf(item);
  const parts: Segment[] = [];
  if (tag) parts.push(seg(tag, item.state === "elevating" ? "accent" : "muted"));
  if (tag && duration !== null) parts.push(seg(COLUMN_GAP));
  if (duration !== null) parts.push(seg(formatClock(duration), "muted"));
  return parts;
}

function tagOf(item: RunItem, elevation: ElevationKind): string | null {
  if (item.retry) return RUN_TAGS.retry(retryLabelOf(item.retry));
  if (item.state === "elevating") return RUN_TAGS.elevating[elevation];
  return item.isAdmin ? RUN_TAGS.admin : null;
}

function versionsOf(item: RunItem): string {
  return item.from !== undefined && item.to !== undefined ? `${item.from} → ${item.to}` : "";
}

function messageOf(model: RunModel, item: RunItem): string | null {
  if (item.state === "cancelled") return RUN_MESSAGES.cancelled;
  if (item.isRetryable && model.phase !== "done") {
    return RUN_MESSAGES.retryable(item.message ?? RUN_MESSAGES.failedWithoutMessage);
  }
  return item.message ?? null;
}

function iconOf(item: RunItem, frame: number): string {
  return ICON[item.state].glyph || spinner(frame);
}

function spinner(frame: number): string {
  const frames = STATUS_GLYPHS.running;
  return frames[frame % frames.length] ?? "";
}

/**
 * The blocks to draw so that `focus` is visible: grow the window around it,
 * one block at a time, on the side that shows fewer blocks so far.
 */
function windowAround(
  blocks: readonly Line[][],
  focus: number,
  rows: number,
): { readonly start: number; readonly end: number } {
  const at = Math.max(0, Math.min(focus, blocks.length - 1));
  const size = (index: number): number => blocks[index]?.length ?? Infinity;
  let start = at;
  let end = Math.min(blocks.length, at + 1);
  let used = blocks[at]?.length ?? 0;
  for (;;) {
    const above = start > 0 ? size(start - 1) : Infinity;
    const below = end < blocks.length ? size(end) : Infinity;
    const isAboveFirst = at - start <= end - 1 - at;
    const grow = pickSide(rows - used, isAboveFirst ? [above, below] : [below, above]);
    if (grow === null) break;
    const isAbove = (grow === 0) === isAboveFirst;
    if (isAbove) used += above;
    else used += below;
    if (isAbove) start--;
    else end++;
  }
  return { start, end };
}

/** Which of the two candidate sizes fits in `room` first (0 or 1), or null. */
function pickSide(room: number, sizes: readonly [number, number]): 0 | 1 | null {
  if (sizes[0] <= room) return 0;
  return sizes[1] <= room ? 1 : null;
}

/** `left` then `right` pushed to the right edge of `width` columns; `left` is cut to fit. */
function justify(left: Line, right: Line, width: number): Line {
  const rightWidth = lineWidth(right);
  const separator = rightWidth > 0 ? 1 : 0;
  const clipped = clip(left, Math.max(0, width - rightWidth - separator));
  const gap = Math.max(separator, width - lineWidth(clipped) - rightWidth);
  return [...clipped, seg(" ".repeat(gap)), ...right];
}

/** `line` cut to `width` columns, the last kept segment ending in an ellipsis. */
function clip(line: Line, width: number): Line {
  const out: Segment[] = [];
  let used = 0;
  for (const segment of line) {
    if (used >= width) break;
    const room = width - used;
    const text = segment.text.length > room ? fit(segment.text, room) : segment.text;
    out.push({ ...segment, text });
    used += text.length;
  }
  return out;
}
