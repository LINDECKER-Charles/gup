import type { HistoryEvent, ScanEvent } from "../history/types.js";
import { countOutcome, emptyCounts, type OutcomeCounts } from "./stats.js";
import { isFullScan } from "./trend.js";
import type { RunSummary, Timed } from "./types.js";

/**
 * One summary per gup process (`runId`): when it ran, what started it, what
 * it scanned and what its updates gave — a session of the journal.
 */

interface RunTally extends OutcomeCounts {
  readonly first: HistoryEvent;
  endedAt: string;
  scans: number;
  lastOutdated: number | null;
}

/** `events` oldest first; the summaries come newest first. */
export function runSummaries(events: readonly Timed<HistoryEvent>[]): RunSummary[] {
  const byRun = new Map<string, RunTally>();
  for (const { event } of events) {
    let tally = byRun.get(event.runId);
    if (tally === undefined) {
      tally = { first: event, endedAt: event.ts, scans: 0, lastOutdated: null, ...emptyCounts() };
      byRun.set(event.runId, tally);
    }
    tally.endedAt = event.ts;
    if (event.kind === "update") countOutcome(tally, event.status);
    else addScan(tally, event);
  }
  return [...byRun.values()].map(summaryOf).reverse();
}

function addScan(tally: RunTally, scan: ScanEvent): void {
  tally.scans += 1;
  if (isFullScan(scan)) tally.lastOutdated = scan.outdated;
}

function summaryOf(tally: RunTally): RunSummary {
  const { first, endedAt, scans, lastOutdated, successes, failures, skips } = tally;
  return {
    runId: first.runId,
    startedAt: first.ts,
    endedAt,
    ...(first.trigger !== undefined && { trigger: first.trigger }),
    gup: first.gup,
    platform: first.platform,
    scans,
    lastOutdated,
    successes,
    failures,
    skips,
  };
}
