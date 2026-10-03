import type { StyledText, TextChunk } from "@opentui/core";
import type { Tui } from "./load-tui.js";

/**
 * What a piece of text means, not which color it is. Every screen paints
 * through these tones, so a prompt and the scan view read the same.
 */
export type Tone = "plain" | "strong" | "muted" | "accent" | "success" | "warning" | "danger";

export interface Segment {
  readonly text: string;
  readonly tone: Tone;
}

export type Line = readonly Segment[];

export function seg(text: string, tone: Tone = "plain"): Segment {
  return { text, tone };
}

/**
 * ANSI palette slots rather than RGB values: the terminal maps them through
 * its own theme, exactly like chalk does for the rest of gup's output. OpenTUI's
 * named colors are fixed RGB (`cyan` is #00FFFF), unreadable on a light theme.
 */
const PALETTE_SLOT: Partial<Record<Tone, number>> = {
  accent: 6,
  success: 2,
  warning: 3,
  danger: 1,
};

/** Lines → one StyledText, ready for a TextRenderable's `content`. */
export function toStyledText(tui: Tui, lines: readonly Line[]): StyledText {
  const chunks: TextChunk[] = [];
  lines.forEach((line, index) => {
    if (index > 0) chunks.push(chunk("\n"));
    for (const segment of line) chunks.push(paint(tui, segment));
  });
  return new tui.StyledText(chunks);
}

function paint(tui: Tui, { text, tone }: Segment): TextChunk {
  const slot = PALETTE_SLOT[tone];
  const painted = chunk(text);
  if (slot !== undefined) painted.fg = tui.RGBA.fromIndex(slot);
  if (tone === "strong") painted.attributes = tui.TextAttributes.BOLD;
  if (tone === "muted") painted.attributes = tui.TextAttributes.DIM;
  return painted;
}

function chunk(text: string): TextChunk {
  return { __isChunk: true, text };
}
