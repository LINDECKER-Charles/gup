import { countOutcome, emptyCounts, median, type OutcomeCounts } from "./stats.js";
import type { Cadence, PackageRecurrence, TimedUpdate, VersionStep } from "./types.js";

/**
 * How often each package gets updated, and at which pace: the counts of its
 * attempts, the median interval between its successful updates, the cadence
 * that interval falls in, and its latest version steps.
 *
 * Successes less than an hour apart are one update (a retry, a second run
 * right after the first): counting them twice would halve the interval of
 * any package that needed a retry.
 */

const RETRY_MERGE_MS = 3_600_000;
/** Version steps kept per package, newest first. */
export const MAX_VERSION_STEPS = 20;
/** Upper bound of each cadence's median interval, in days; beyond: rare. */
const CADENCE_MAX_DAYS = { weekly: 10, monthly: 45, quarterly: 120 } as const;

const MS_PER_DAY = 86_400_000;
const KEY_SEPARATOR = "\u0000";

interface PackageTally extends OutcomeCounts {
  readonly providerId: string;
  readonly packageId: string;
  readonly firstAt: string;
  lastAt: string;
  /** Instants of the successful updates, oldest first. */
  readonly successAts: number[];
  readonly steps: VersionStep[];
}

export function packageRecurrence(updates: readonly TimedUpdate[]): PackageRecurrence[] {
  const byPackage = new Map<string, PackageTally>();
  for (const update of updates) addAttempt(byPackage, update);
  return [...byPackage.values()].map(recurrenceOf).sort(mostUpdatedFirst);
}

/** The cadence of a package from its successes and the median interval between them. */
export function cadenceOf(successes: number, medianIntervalDays: number | null): Cadence {
  if (successes === 0) return "none";
  if (medianIntervalDays === null) return "once";
  if (medianIntervalDays <= CADENCE_MAX_DAYS.weekly) return "weekly";
  if (medianIntervalDays <= CADENCE_MAX_DAYS.monthly) return "monthly";
  if (medianIntervalDays <= CADENCE_MAX_DAYS.quarterly) return "quarterly";
  return "rare";
}

function addAttempt(byPackage: Map<string, PackageTally>, { event, at }: TimedUpdate): void {
  const key = `${event.providerId}${KEY_SEPARATOR}${event.packageId}`;
  let tally = byPackage.get(key);
  if (tally === undefined) {
    tally = {
      providerId: event.providerId,
      packageId: event.packageId,
      firstAt: event.ts,
      lastAt: event.ts,
      successAts: [],
      steps: [],
      ...emptyCounts(),
    };
    byPackage.set(key, tally);
  }
  tally.lastAt = event.ts;
  countOutcome(tally, event.status);
  if (event.status !== "success") return;
  tally.successAts.push(at);
  tally.steps.push({
    at: event.ts,
    ...(event.from !== undefined && { from: event.from }),
    ...(event.to !== undefined && { to: event.to }),
  });
}

function recurrenceOf(tally: PackageTally): PackageRecurrence {
  const { providerId, packageId, successes, failures, skips, firstAt, lastAt, steps } = tally;
  const medianIntervalDays = medianIntervalOf(tally.successAts);
  const lastVersion = steps.at(-1)?.to;
  return {
    providerId,
    packageId,
    successes,
    failures,
    skips,
    firstAt,
    lastAt,
    ...(lastVersion !== undefined && { lastVersion }),
    medianIntervalDays,
    cadence: cadenceOf(successes, medianIntervalDays),
    versions: steps.slice(-MAX_VERSION_STEPS).reverse(),
  };
}

/** Median days between successive updates, retries merged; null under two updates. */
function medianIntervalOf(successAts: readonly number[]): number | null {
  const intervals: number[] = [];
  let previous: number | null = null;
  for (const at of successAts) {
    if (previous === null) previous = at;
    else if (at - previous >= RETRY_MERGE_MS) {
      intervals.push((at - previous) / MS_PER_DAY);
      previous = at;
    }
  }
  return median(intervals);
}

function mostUpdatedFirst(a: PackageRecurrence, b: PackageRecurrence): number {
  if (a.successes !== b.successes) return b.successes - a.successes;
  if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
  return a.packageId.localeCompare(b.packageId) || a.providerId.localeCompare(b.providerId);
}
