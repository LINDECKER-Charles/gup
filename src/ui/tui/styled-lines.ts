import type { StyledText, TextChunk } from "@opentui/core";
import type { Tui } from "./load-tui.js";

/**
 * What a piece of text means, not which color it is. Every screen paints
 * through these tones, so panels, dialogs and bars read the same.
 */
export type Tone =
  "plain" | "strong" | "muted" | "accent" | "success" | "warning" | "danger" | "onAccent";

/** Background behind a segment: the title bar, or the row under the cursor. */
export type Fill = "accent" | "highlight";

export interface Segment {
  readonly text: string;
  readonly tone: Tone;
  readonly fill?: Fill;
}

export type Line = readonly Segment[];

export function seg(text: string, tone: Tone = "plain", fill?: Fill): Segment {
  return fill ? { text, tone, fill } : { text, tone };
}

/**
 * ANSI palette slots rather than RGB values: the terminal maps them through
 * its own theme, exactly like chalk does for the rest of gup's output. OpenTUI's
 * named colors are fixed RGB (`cyan` is #00FFFF), unreadable on a light theme.
 */
const FG_SLOT: Partial<Record<Tone, number>> = {
  accent: 6,
  success: 2,
  warning: 3,
  danger: 1,
  onAccent: 0,
};
const BG_SLOT: Record<Fill, number> = { accent: 6, highlight: 8 };

/** Lines → one StyledText, ready for a TextRenderable's `content`. */
export function toStyledText(tui: Tui, lines: readonly Line[]): StyledText {
  const chunks: TextChunk[] = [];
  lines.forEach((line, index) => {
    if (index > 0) chunks.push({ __isChunk: true, text: "\n" });
    for (const segment of line) chunks.push(paint(tui, segment));
  });
  return new tui.StyledText(chunks);
}

function paint(tui: Tui, { text, tone, fill }: Segment): TextChunk {
  const painted: TextChunk = { __isChunk: true, text };
  const fg = FG_SLOT[tone];
  if (fg !== undefined) painted.fg = tui.RGBA.fromIndex(fg);
  if (fill) painted.bg = tui.RGBA.fromIndex(BG_SLOT[fill]);
  if (tone === "strong" || tone === "onAccent") painted.attributes = tui.TextAttributes.BOLD;
  if (tone === "muted") painted.attributes = tui.TextAttributes.DIM;
  return painted;
}

/** Visible width of a line. */
export function lineWidth(line: Line): number {
  return line.reduce((width, segment) => width + segment.text.length, 0);
}

/**
 * The line cut or padded to exactly `width` columns, every segment on `fill`
 * — what makes a highlighted row or a title bar span the whole panel.
 */
export function fillLine(line: Line, width: number, fill: Fill): Line {
  const out: Segment[] = [];
  let used = 0;
  for (const segment of line) {
    if (used >= width) break;
    const text = segment.text.slice(0, width - used);
    out.push({ ...segment, text, fill });
    used += text.length;
  }
  if (used < width) out.push({ text: " ".repeat(width - used), tone: "plain", fill });
  return out;
}

/** Word wrap to `width` columns. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** `text` cut to `width` columns with an ellipsis, or padded to it. */
export function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}
