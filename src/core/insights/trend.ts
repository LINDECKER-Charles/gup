import type { ScanEvent } from "../history/types.js";
import type { TimedScan, TrendPoint } from "./types.js";

/**
 * How many packages were outdated, day after day: the last full scan of each
 * day. A fast scan skips the slow providers and a filtered one looks at a
 * few: either would draw a drop that never happened.
 */

export function isFullScan(scan: ScanEvent): boolean {
  return !scan.fast && scan.filter.length === 0;
}

/** One point per day with a full scan, oldest first (`scans` oldest first). */
export function outdatedTrend(scans: readonly TimedScan[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const { event, day } of scans) {
    if (!isFullScan(event)) continue;
    const point = { day, outdated: event.outdated };
    if (points.at(-1)?.day === day) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}
