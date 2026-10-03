import { compareDays, weekStartOf, type DayKey } from "../time/calendar.js";
import type { DayActivity, TimedScan, TimedUpdate, WeekActivity } from "./types.js";

/**
 * Activity per local day and per week (Monday first): what the heatmap and
 * the weekly bars draw. Only days with activity are listed.
 */

interface ActivityCounts {
  success: number;
  failed: number;
  skipped: number;
  scans: number;
}

export function dailyActivity(
  updates: readonly TimedUpdate[],
  scans: readonly TimedScan[],
): DayActivity[] {
  const byDay = new Map<DayKey, ActivityCounts>();
  // The counters are named after the statuses.
  for (const { day, event } of updates) countsOf(byDay, day)[event.status] += 1;
  for (const { day } of scans) countsOf(byDay, day).scans += 1;
  return [...byDay]
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => compareDays(a.day, b.day));
}

/** `days` folded into their weeks, oldest week first. */
export function weeklyActivity(days: readonly DayActivity[]): WeekActivity[] {
  const byWeek = new Map<DayKey, ActivityCounts>();
  for (const { day, success, failed, skipped, scans } of days) {
    const counts = countsOf(byWeek, weekStartOf(day));
    counts.success += success;
    counts.failed += failed;
    counts.skipped += skipped;
    counts.scans += scans;
  }
  return [...byWeek]
    .map(([weekStart, counts]) => ({ weekStart, ...counts }))
    .sort((a, b) => compareDays(a.weekStart, b.weekStart));
}

function countsOf(map: Map<DayKey, ActivityCounts>, key: DayKey): ActivityCounts {
  let counts = map.get(key);
  if (counts === undefined) {
    counts = { success: 0, failed: 0, skipped: 0, scans: 0 };
    map.set(key, counts);
  }
  return counts;
}
