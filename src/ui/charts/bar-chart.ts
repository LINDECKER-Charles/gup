import type { ChartGlyphs } from "./chart-glyphs.js";
import { barEighths, EIGHTHS_PER_CELL } from "./scale.js";

export interface BarSpec {
  readonly value: number;
  /** The value of a full bar. */
  readonly max: number;
  /** Width of a full bar, in columns. */
  readonly cells: number;
}

/**
 * A horizontal bar of `value` against `max`, exactly `cells` columns wide:
 * whole blocks, then the eighth block that ends it (`███▍`), then spaces.
 * A glyph set without eighths rounds to whole cells. A non-zero value always
 * shows at least a sliver.
 */
export function barText({ value, max, cells }: BarSpec, glyphs: ChartGlyphs): string {
  if (cells <= 0) return "";
  const eighths = barEighths(value, max, cells);
  const hasEighths = glyphs.eighths.length === EIGHTHS_PER_CELL;
  const whole = hasEighths
    ? Math.floor(eighths / EIGHTHS_PER_CELL)
    : Math.min(cells, Math.max(eighths > 0 ? 1 : 0, Math.round(eighths / EIGHTHS_PER_CELL)));
  const partial = hasEighths ? (glyphs.eighths[eighths % EIGHTHS_PER_CELL] ?? "") : "";
  return `${glyphs.full.repeat(whole)}${partial}`.padEnd(cells);
}
