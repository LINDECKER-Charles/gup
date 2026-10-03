import type { ChartGlyphs } from "./chart-glyphs.js";
import { resample } from "./scale.js";

/**
 * A series as one line of `width` characters at most, one level per point,
 * scaled from 0 to the series' maximum: counts are drawn from zero, so a
 * small wobble is not shown as a cliff.
 */
export function sparkline(values: readonly number[], width: number, glyphs: ChartGlyphs): string {
  const points = resample(values, width);
  const max = Math.max(0, ...points);
  const top = glyphs.spark.length - 1;
  return points
    .map((value) => glyphs.spark[max === 0 ? 0 : Math.round((value / max) * top)] ?? "")
    .join("");
}
