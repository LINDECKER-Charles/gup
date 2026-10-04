import { TextAttributes, type CapturedFrame, type CapturedSpan } from "@opentui/core";
import type { Hex, TerminalPalette } from "./docs-palette.js";
import { resolveColor } from "./resolve-color.js";

/** One run of identically styled cells, its colours resolved for a palette. */
export interface FrameSpan {
  readonly text: string;
  /** First cell of the span: spans are contiguous, so col = sum of previous widths. */
  readonly col: number;
  /** Cells covered (a wide glyph covers 2 cells but is 1 character). */
  readonly width: number;
  readonly fg: Hex;
  /** Null: the terminal's own background shows through. */
  readonly bg: Hex | null;
  readonly isBold: boolean;
  readonly isDim: boolean;
  readonly isItalic: boolean;
  readonly isUnderline: boolean;
  readonly isStrikethrough: boolean;
}

/** A captured frame as a terminal with a given palette shows it. */
export interface FrameModel {
  readonly cols: number;
  readonly rows: number;
  readonly lines: readonly (readonly FrameSpan[])[];
}

/**
 * Resolve every span of `frame` against `palette` and decode its attributes
 * (OpenTUI's TextAttributes bits). INVERSE swaps the resolved colours (a
 * transparent background becomes the palette background); HIDDEN blanks the
 * text but keeps the background.
 */
export function toFrameModel(frame: CapturedFrame, palette: TerminalPalette): FrameModel {
  return {
    cols: frame.cols,
    rows: frame.rows,
    lines: frame.lines.map((line) => {
      let col = 0;
      return line.spans.map((span) => {
        const model = toFrameSpan(span, col, palette);
        col += span.width;
        return model;
      });
    }),
  };
}

function toFrameSpan(span: CapturedSpan, col: number, palette: TerminalPalette): FrameSpan {
  const has = (bit: number): boolean => (span.attributes & bit) !== 0;
  const { fg, bg } = colorsOf(span, has(TextAttributes.INVERSE), palette);
  return {
    text: has(TextAttributes.HIDDEN) ? " ".repeat(span.text.length) : span.text,
    col,
    width: span.width,
    fg,
    bg,
    isBold: has(TextAttributes.BOLD),
    isDim: has(TextAttributes.DIM),
    isItalic: has(TextAttributes.ITALIC),
    isUnderline: has(TextAttributes.UNDERLINE),
    isStrikethrough: has(TextAttributes.STRIKETHROUGH),
  };
}

function colorsOf(
  span: CapturedSpan,
  isInverse: boolean,
  palette: TerminalPalette,
): { readonly fg: Hex; readonly bg: Hex | null } {
  const fg = resolveColor(span.fg, "fg", palette) ?? palette.foreground;
  const bg = resolveColor(span.bg, "bg", palette);
  return isInverse ? { fg: bg ?? palette.background, bg: fg } : { fg, bg };
}
