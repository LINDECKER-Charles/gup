import type { ChartGlyphs } from "./chart-glyphs.js";
import { barSteps } from "./scale.js";

export interface BarSpec {
  readonly value: number;
  /** The value of a full bar. */
  readonly max: number;
  /** Width of a full bar, in columns. */
  readonly cells: number;
}

/**
 * A horizontal bar of `value` against `max`, exactly `cells` columns wide:
 * whole blocks, then the partial block that ends it (`███▌`), then spaces.
 * A glyph set without partials rounds to whole cells. A non-zero value always
 * shows at least a sliver.
 */
export function barText({ value, max, cells }: BarSpec, glyphs: ChartGlyphs): string {
  if (cells <= 0) return "";
  const perCell = Math.max(1, glyphs.partials.length);
  const steps = barSteps(value, max, cells * perCell);
  const partial = glyphs.partials[steps % perCell] ?? "";
  return `${glyphs.full.repeat(Math.floor(steps / perCell))}${partial}`.padEnd(cells);
}
