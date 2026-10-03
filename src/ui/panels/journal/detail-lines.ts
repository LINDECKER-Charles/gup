import { printable } from "../../log-line.js";
import { seg, wrap, type Line } from "../../tui/styled-lines.js";
import type { BrowsableList } from "./browsable-list.js";

/**
 * The detail mode every journal list opens with Entrée: a title, then
 * "label  value" rows and free text, scrolled within the panel. Free text
 * keeps its paragraphs and is made printable (a message may carry what a
 * tool printed).
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
    const [first = "", ...rest] = wrap(printable(value), Math.max(1, width - labelWidth));
    return [
      [seg(label.padEnd(labelWidth), "muted"), seg(first)],
      ...rest.map((line): Line => [seg(" ".repeat(labelWidth)), seg(line)]),
    ];
  });
}

/** A titled block of free text, its paragraphs kept, each wrapped and indented. */
export function textBlock(title: string, text: string, width: number): Line[] {
  const paragraphs = text.split(/\r?\n/).map(printable).filter(Boolean);
  const room = Math.max(1, width - TEXT_INDENT.length);
  return [
    [seg(title, "strong")],
    ...paragraphs.flatMap((paragraph) =>
      wrap(paragraph, room).map((line): Line => [seg(`${TEXT_INDENT}${line}`)]),
    ),
  ];
}

/** Where a detail is drawn: the list holding its scroll offset, and the room it has. */
export interface DetailFrame<T> {
  readonly list: BrowsableList<T>;
  readonly height: number;
}

/** The detail as drawn: its title line on top, the body scrolled to the list's detail offset. */
export function detailView<T>(title: Line, body: readonly Line[], frame: DetailFrame<T>): Line[] {
  const room = Math.max(1, frame.height - 2);
  const start = frame.list.detailStart(body.length, room);
  return [title, [], ...body.slice(start, start + room)];
}
