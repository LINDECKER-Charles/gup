import type { GlyphMode } from "../theme/glyphs.js";

/**
 * The marks charts draw with, per glyph mode. The mode itself comes from
 * the screen's appearance (TUI) or `resolveGlyphMode` (text output): charts
 * never decide it. ASCII sets are their own, not a translation of the
 * Unicode ones — `toAscii` maps every block to `#`, which would flatten a
 * heatmap or a sparkline into one level.
 */

export interface ChartGlyphs {
  /** Heat levels 0 (nothing) … 4 (the busiest days). */
  readonly heat: readonly [string, string, string, string, string];
  /** A whole bar cell. */
  readonly full: string;
  /** Partial cells by eighths: index 1 = ⅛ … 7 = ⅞; empty when the set has whole cells only. */
  readonly eighths: readonly string[];
  /** Sparkline levels, lowest first. */
  readonly spark: readonly string[];
}

const UNICODE: ChartGlyphs = {
  heat: ["·", "░", "▒", "▓", "█"],
  full: "█",
  eighths: ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"],
  spark: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"],
};

const ASCII: ChartGlyphs = {
  heat: [".", ":", "+", "*", "#"],
  full: "#",
  eighths: [],
  spark: ["_", ".", "-", "~", "=", "^"],
};

export function chartGlyphs(mode: GlyphMode): ChartGlyphs {
  return mode === "ascii" ? ASCII : UNICODE;
}
