import { printable } from "../../log-line.js";
import { seg, wrap, type Line } from "../../tui/styled-lines.js";
import type { BrowsableList } from "./browsable-list.js";

/**
 * The detail mode every journal list opens with Entrée: a title, then
 * "label  value" rows and free text, scrolled within the panel. Free text
 * keeps its paragraphs and is made printable (a message may carry what a
 * tool printed). Nothing is lost at the panel's edge: a title, a value or a
 * word wider than a row (a long package id, a path, a URL) goes on to the
 * next row.
 */

/** A label and its value; a missing value drops the row. */
export type DetailField = readonly [label: string, value: string | undefined];

const LABEL_GAP = 2;
const TEXT_INDENT = "  ";

/** Rows of aligned labels and values, a long value wrapped under its own column. */
export function fieldLines(fields: readonly DetailField[], width: number): Line[] {
  const present = fields.filter(
    (field): field is readonly [string, string] => field[1] !== undefined,
  );
  const labelWidth = Math.max(0, ...present.map(([label]) => label.length)) + LABEL_GAP;
  return present.flatMap(([label, value]) => {
    const [first = "", ...rest] = wrapAll(printable(value), width - labelWidth);
    return [
      [seg(label.padEnd(labelWidth), "muted"), seg(first)],
      ...rest.map((line): Line => [seg(" ".repeat(labelWidth)), seg(line)]),
    ];
  });
}

/** A titled block of free text, its paragraphs kept, each wrapped and indented. */
export function textBlock(title: string, text: string, width: number): Line[] {
  const paragraphs = text.split(/\r?\n/).map(printable).filter(Boolean);
  return [
    [seg(title, "strong")],
    ...paragraphs.flatMap((paragraph) => indentedLines(paragraph, TEXT_INDENT, width)),
  ];
}

/** `text` wrapped under `indent`, every row `width` columns at most. */
export function indentedLines(text: string, indent: string, width: number): Line[] {
  return wrapAll(text, width - indent.length).map((line): Line => [seg(`${indent}${line}`)]);
}

/** Where a detail is drawn: the list holding its scroll offset, and the room it has. */
export interface DetailFrame<T> {
  readonly list: BrowsableList<T>;
  readonly width: number;
  readonly height: number;
}

/** The detail as drawn: its title on top, the body scrolled to the list's detail offset. */
export function detailView<T>(title: Line, body: readonly Line[], frame: DetailFrame<T>): Line[] {
  const head = titleLines(title, frame.width);
  const room = Math.max(1, frame.height - head.length - 1);
  const start = frame.list.detailStart(body.length, room);
  return [...head, [], ...body.slice(start, start + room)];
}

/** The title as styled when it fits the width, else its whole text wrapped. */
function titleLines(title: Line, width: number): Line[] {
  const text = title.map((segment) => segment.text).join("");
  if (text.length <= width) return [title];
  return wrapAll(text, width).map((line): Line => [seg(line, "strong")]);
}

/** `text` wrapped to `width`, a word wider than that cut across rows. */
function wrapAll(text: string, width: number): string[] {
  const room = Math.max(1, width);
  return wrap(text, room).flatMap((line) => {
    const rows: string[] = [];
    for (let start = 0; start < line.length; start += room) rows.push(line.slice(start, start + room));
    return rows;
  });
}
