/**
 * The arithmetic behind the charts, pure: which intensity a value gets, how
 * many eighths of a cell a bar fills, how a long series fits a short width.
 */

/** A bar cell splits into eighths (the Unicode eighth blocks ▏…▉). */
export const EIGHTHS_PER_CELL = 8;

/**
 * Maps a value to a level `0..levels-1` by the quantiles of the distinct
 * non-zero values: 0 stays 0, the rest spread over `1..levels-1` — so one
 * busy day does not wash every other day out to the lowest level.
 *
 * Distinct values, because daily counts repeat: the quartiles of a history
 * made mostly of one-update days are all 1 or 2, which leaves levels unused
 * and draws a day of 8 updates like a day of 3.
 */
export function quantileLevels(
  values: readonly number[],
  levels: number,
): (value: number) => number {
  const sorted = [...new Set(values.filter((value) => value > 0))].sort((a, b) => a - b);
  const steps = levels - 1;
  const thresholds: number[] = [];
  for (let step = 1; step < steps && sorted.length > 0; step++) {
    thresholds.push(sorted[Math.ceil((step * sorted.length) / steps) - 1] as number);
  }
  return (value) => {
    if (value <= 0) return 0;
    return 1 + thresholds.filter((threshold) => value > threshold).length;
  };
}

/** Eighths of a cell a bar of `value` fills over `cells` cells (one at least when non-zero). */
export function barEighths(value: number, max: number, cells: number): number {
  if (value <= 0 || max <= 0 || cells <= 0) return 0;
  const total = cells * EIGHTHS_PER_CELL;
  return Math.min(total, Math.max(1, Math.round((value / max) * total)));
}

/** `values` fitted to `width` points: unchanged when they fit, else the mean of each bucket. */
export function resample(values: readonly number[], width: number): number[] {
  if (width <= 0) return [];
  if (values.length <= width) return [...values];
  return Array.from({ length: width }, (_unused, index) => {
    const start = Math.floor((index * values.length) / width);
    const end = Math.floor(((index + 1) * values.length) / width);
    const bucket = values.slice(start, end);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  });
}
