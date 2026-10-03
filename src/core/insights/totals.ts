import { ratio } from "./stats.js";
import type { InsightTotals, PackageRecurrence, TimedScan, TimedUpdate, TrendPoint } from "./types.js";

/** The headline numbers of a period: the journal's first lines, the report's cards. */

export interface TotalsInput {
  /** Oldest first, like every list below. */
  readonly updates: readonly TimedUpdate[];
  readonly scans: readonly TimedScan[];
  readonly recurrence: readonly PackageRecurrence[];
  readonly trend: readonly TrendPoint[];
}

export function insightTotals({ updates, scans, recurrence, trend }: TotalsInput): InsightTotals {
  let successes = 0;
  let failures = 0;
  let lastUpdateAt: string | null = null;
  for (const { event } of updates) {
    if (event.status === "success") {
      successes += 1;
      lastUpdateAt = event.ts;
    } else if (event.status === "failed") failures += 1;
  }
  return {
    attempts: updates.length,
    successes,
    failures,
    skips: updates.length - successes - failures,
    distinctPackages: recurrence.filter((entry) => entry.successes > 0).length,
    scans: scans.length,
    successRate: ratio(successes, successes + failures),
    lastUpdateAt,
    lastScanAt: scans.at(-1)?.event.ts ?? null,
    lastOutdated: trend.at(-1)?.outdated ?? null,
  };
}
