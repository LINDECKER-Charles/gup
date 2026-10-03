import type { Density } from "../../theme/appearance.js";
import { ListCursor } from "../../tui/list-cursor.js";
import {
  fillLine,
  fit,
  lineWidth,
  seg,
  wrap,
  type Line,
  type Segment,
} from "../../tui/styled-lines.js";
import type { Viewport } from "../panel.js";
import type { OptionRow, OptionSection } from "./option-row.js";

/**
 * The Options list as lines: section headers (never selectable), rows as
 * `› Label   [value]   hint` in aligned columns, a blank row between
 * sections unless the density is compact. Only the part around the cursor is
 * drawn when the list is taller than the panel. On a narrow panel a hint cut
 * to a few columns says nothing: it is left out of its row, and the cursor
 * row's hint is shown in full under the list instead.
 */

export type ListItem =
  | { readonly kind: "header"; readonly title: string }
  | { readonly kind: "row"; readonly row: OptionRow }
  | { readonly kind: "gap" };

/** The rows a cursor can stand on, in order. */
export function rowsOf(items: readonly ListItem[]): OptionRow[] {
  return items.flatMap((item) => (item.kind === "row" ? [item.row] : []));
}

export function listItems(sections: readonly OptionSection[], density: Density): ListItem[] {
  return sections.flatMap((section, index): ListItem[] => {
    const gap: ListItem[] = index > 0 && density === "comfortable" ? [{ kind: "gap" }] : [];
    const rows = section.rows().map((row): ListItem => ({ kind: "row", row }));
    return [...gap, { kind: "header", title: section.title }, ...rows];
  });
}

const GUTTER = 2;
const COLUMN_GAP = 2;
const MAX_LABEL = 22;
const MAX_VALUE = 26;
/** Narrower than this, a hint cut to fit says nothing: it is left out of the row. */
const MIN_HINT_WIDTH = 16;
/** Rows of the cursor row's hint under the list, always that many so the list never jumps. */
const DETAIL_HINT_ROWS = 2;

interface Columns {
  readonly label: number;
  readonly value: number;
}

/** Labels and values aligned across every section, each column as wide as its widest entry. */
function columnsOf(rows: readonly OptionRow[]): Columns {
  const widest = (lengths: readonly number[], cap: number): number =>
    Math.min(cap, Math.max(0, ...lengths)) + COLUMN_GAP;
  return {
    label: widest(
      rows.map((row) => row.label.length),
      MAX_LABEL,
    ),
    value: widest(
      rows.map((row) => bracketed(row.value()).length),
      MAX_VALUE,
    ),
  };
}

function bracketed(value: string): string {
  return value === "" ? "" : `[${value}]`;
}

/** The items around the cursor that fit in `height` rows. */
export function visibleRange(
  items: readonly ListItem[],
  cursor: OptionRow | undefined,
  height: number,
): { readonly start: number; readonly end: number } {
  const index = items.findIndex((item) => item.kind === "row" && item.row === cursor);
  const cursorRange = new ListCursor(
    items.map((item) => item.kind === "row"),
    Math.max(0, index),
  );
  return cursorRange.window(Math.max(1, height));
}

export function renderItems(
  items: readonly ListItem[],
  cursor: OptionRow | undefined,
  viewport: Viewport,
): Line[] {
  const columns = columnsOf(rowsOf(items));
  const { start, end } = visibleRange(items, cursor, viewport.height);
  return items.slice(start, end).map((item): Line => {
    if (item.kind === "gap") return [];
    if (item.kind === "header") return [seg(item.title, "strong")];
    const isCursor = item.row === cursor;
    const line = rowLine(item.row, columns, { width: viewport.width, isCursor });
    return isCursor ? fillLine(line, viewport.width, "highlight") : line;
  });
}

/**
 * Under the list when some row cannot show its whole hint beside it: a blank
 * row, then — when the cursor row is one of them — its hint in full, wrapped
 * on a fixed number of rows (kept blank otherwise, so the list never jumps).
 * Empty when every hint fits inline.
 */
export function detailLines(
  items: readonly ListItem[],
  cursor: OptionRow | undefined,
  width: number,
): Line[] {
  const columns = columnsOf(rowsOf(items));
  const fits = (row: OptionRow): boolean =>
    lineWidth(cellsOf(row, columns, false)) + lineWidth(row.hint()) <= width;
  if (rowsOf(items).every(fits)) return [];
  const hint = cursor && !fits(cursor) ? wrapLine(cursor.hint(), width) : [];
  return [[], ...Array.from({ length: DETAIL_HINT_ROWS }, (_, index) => hint[index] ?? [])];
}

/** The row cut to `width`, with its hint when it has room to say something. */
function rowLine(row: OptionRow, columns: Columns, at: { width: number; isCursor: boolean }): Line {
  const cells = cellsOf(row, columns, at.isCursor);
  const hasRoom = at.width - lineWidth(cells) >= MIN_HINT_WIDTH;
  return clipLine(hasRoom ? [...cells, ...row.hint()] : cells, at.width);
}

/** Gutter, label and value; an action row (no value) lets its hint start in the value column. */
function cellsOf(row: OptionRow, columns: Columns, isCursor: boolean): Line {
  const isEnabled = row.isEnabled();
  const value = bracketed(row.value());
  return [
    seg(isCursor ? "› " : " ".repeat(GUTTER), "accent"),
    seg(fit(row.label, columns.label), isEnabled ? "plain" : "disabled"),
    ...(value === "" ? [] : [seg(fit(value, columns.value), isEnabled ? "accent" : "disabled")]),
  ];
}

/** Each segment word-wrapped to `width`, in its own tone; a word longer than that is cut. */
function wrapLine(line: Line, width: number): Line[] {
  return line.flatMap((segment) =>
    wrap(segment.text, width).map((part) => clipLine([seg(part, segment.tone)], width)),
  );
}

/** `line` cut to `width` columns, an ellipsis marking the cut. */
export function clipLine(line: Line, width: number): Line {
  if (lineWidth(line) <= width) return line;
  const out: Segment[] = [];
  let used = 0;
  for (const segment of line) {
    const room = width - used;
    if (room <= 0) break;
    const text = segment.text.length <= room ? segment.text : fit(segment.text, room);
    out.push({ ...segment, text });
    used += text.length;
  }
  return out;
}
