import type { HistoryEvent } from "../history/types.js";
import { dayKeyOf, type DayKey } from "../time/calendar.js";
import type { Period } from "../time/period.js";
import { dailyActivity, weeklyActivity } from "./activity.js";
import { failureGroups } from "./failures.js";
import { providerStats } from "./providers.js";
import { packageRecurrence } from "./recurrence.js";
import { runSummaries } from "./runs.js";
import { insightTotals } from "./totals.js";
import { outdatedTrend } from "./trend.js";
import type { Insights, Timed, TimedScan, TimedUpdate } from "./types.js";

/**
 * The one aggregation of the activity history every front-end shares: the
 * events are timed once (instant and local day), split once into updates
 * and scans, then each builder makes one pass — O(n), or O(n log n) where it
 * sorts. Pure: same events, same insights.
 */

export interface InsightOptions {
  /** The period the events were read for (they are expected inside it). */
  readonly period: Period;
  /** The local day of an instant; injectable so a test does not depend on the time zone. */
  readonly dayKey?: (date: Date) => DayKey;
}

export function buildInsights(events: readonly HistoryEvent[], options: InsightOptions): Insights {
  const timed = timedEvents(events, options.dayKey ?? dayKeyOf);
  const updates: TimedUpdate[] = [];
  const scans: TimedScan[] = [];
  for (const entry of timed) {
    if (entry.event.kind === "update") updates.push(entry as TimedUpdate);
    else scans.push(entry as TimedScan);
  }
  const days = dailyActivity(updates, scans);
  const recurrence = packageRecurrence(updates);
  const trend = outdatedTrend(scans);
  return {
    period: options.period,
    totals: insightTotals({ updates, scans, recurrence, trend }),
    days,
    weeks: weeklyActivity(days),
    recurrence,
    providers: providerStats(updates, scans),
    trend,
    failures: failureGroups(updates),
    runs: runSummaries(timed),
  };
}

/** Each event with its instant and local day, oldest first (a stable sort: ties keep their order). */
function timedEvents(
  events: readonly HistoryEvent[],
  dayKey: (date: Date) => DayKey,
): Timed<HistoryEvent>[] {
  const timed = events.map((event) => {
    const at = Date.parse(event.ts);
    return { event, at, day: dayKey(new Date(at)) };
  });
  return timed.sort((a, b) => a.at - b.at);
}
