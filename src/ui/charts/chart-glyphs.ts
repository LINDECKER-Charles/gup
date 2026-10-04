import type { GlyphMode } from "../theme/glyphs.js";

/**
 * The marks charts draw with, per glyph mode. The mode itself comes from
 * the screen's appearance (TUI) or `resolveGlyphMode` (text output): charts
 * never decide it. ASCII sets are their own, not a translation of the
 * Unicode ones — `toAscii` maps every block to `#`, which would flatten a
 * heatmap or a sparkline into one level.
 *
 * The Unicode set keeps to the blocks Consolas draws (see `glyphs.ts`): the
 * shades, the full block and the half blocks — not the eighths ▁…▇ and
 * ▏…▉, which the Windows console host showed as boxed question marks.
 */

export interface ChartGlyphs {
  /** Heat levels 0 (nothing) … 4 (the busiest days). */
  readonly heat: readonly [string, string, string, string, string];
  /** A whole bar cell. */
  readonly full: string;
  /**
   * The fills that end a bar inside a cell, `partials[i]` covering i / length
   * of it (index 0 fills nothing); empty when bars round to whole cells.
   */
  readonly partials: readonly string[];
  /** Sparkline levels, lowest first. */
  readonly spark: readonly string[];
}

const UNICODE: ChartGlyphs = {
  heat: ["·", "░", "▒", "▓", "█"],
  full: "█",
  partials: ["", "▌"],
  spark: ["_", "▄", "█"],
};

const ASCII: ChartGlyphs = {
  heat: [".", ":", "+", "*", "#"],
  full: "#",
  partials: [],
  spark: ["_", ".", "-", "~", "=", "^"],
};

export function chartGlyphs(mode: GlyphMode): ChartGlyphs {
  return mode === "ascii" ? ASCII : UNICODE;
}
