import { countOutcome, emptyCounts, median, type OutcomeCounts } from "./stats.js";
import type { ProviderStats, TimedScan, TimedUpdate } from "./types.js";

/**
 * Per provider: its update attempts and their outcomes, how long an update
 * and its own scan usually take, and how often its scan failed. A provider
 * that was scanned but never updated is listed too.
 */

interface ProviderTally extends OutcomeCounts {
  readonly updateMs: number[];
  readonly scanMs: number[];
  scanErrors: number;
  lastScanError?: string;
}

export function providerStats(
  updates: readonly TimedUpdate[],
  scans: readonly TimedScan[],
): ProviderStats[] {
  const byProvider = new Map<string, ProviderTally>();
  for (const { event } of updates) {
    const tally = tallyOf(byProvider, event.providerId);
    countOutcome(tally, event.status);
    if (event.durationMs !== undefined) tally.updateMs.push(event.durationMs);
  }
  for (const { event } of scans) {
    for (const provider of event.providers) {
      const tally = tallyOf(byProvider, provider.providerId);
      if (provider.durationMs !== undefined) tally.scanMs.push(provider.durationMs);
      if (provider.error === undefined) continue;
      tally.scanErrors += 1;
      tally.lastScanError = provider.error;
    }
  }
  return [...byProvider]
    .map(([providerId, tally]) => statsOf(providerId, tally))
    .sort(busiestFirst);
}

function tallyOf(byProvider: Map<string, ProviderTally>, providerId: string): ProviderTally {
  let tally = byProvider.get(providerId);
  if (tally === undefined) {
    tally = { ...emptyCounts(), updateMs: [], scanMs: [], scanErrors: 0 };
    byProvider.set(providerId, tally);
  }
  return tally;
}

function statsOf(providerId: string, tally: ProviderTally): ProviderStats {
  const { successes, failures, skips, scanErrors, lastScanError } = tally;
  return {
    providerId,
    attempts: successes + failures + skips,
    successes,
    failures,
    skips,
    medianUpdateMs: median(tally.updateMs),
    medianScanMs: median(tally.scanMs),
    scanErrors,
    ...(lastScanError !== undefined && { lastScanError }),
  };
}

function busiestFirst(a: ProviderStats, b: ProviderStats): number {
  return b.attempts - a.attempts || a.providerId.localeCompare(b.providerId);
}
