import type { ScanEvent, UpdateEvent } from "../history/types.js";
import type { RunTrigger } from "../state/run-context.js";
import type { DayKey } from "../time/calendar.js";
import type { Period } from "../time/period.js";

/**
 * What the activity history says once aggregated: the shapes every front-end
 * (the journal view, `gup report`, the HTML report, the diagnostic archive)
 * draws from. Pure data, computed once by `buildInsights`.
 */

/**
 * How often a package gets updated, from the median interval between its
 * successful updates: `none` never succeeded, `once` succeeded once.
 */
export type Cadence = "weekly" | "monthly" | "quarterly" | "rare" | "once" | "none";

export interface DayActivity {
  readonly day: DayKey;
  readonly success: number;
  readonly failed: number;
  readonly skipped: number;
  readonly scans: number;
}

export interface WeekActivity extends Omit<DayActivity, "day"> {
  /** The Monday of the week. */
  readonly weekStart: DayKey;
}

/** One successful update of a package: when, from which version, to which. */
export interface VersionStep {
  readonly at: string;
  readonly from?: string;
  readonly to?: string;
}

export interface PackageRecurrence {
  readonly providerId: string;
  readonly packageId: string;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
  /** First and last attempt, whatever their outcome (ISO 8601). */
  readonly firstAt: string;
  readonly lastAt: string;
  /** The version the last successful update installed, when known. */
  readonly lastVersion?: string;
  /** Median days between successful updates (retries merged); null under two of them. */
  readonly medianIntervalDays: number | null;
  readonly cadence: Cadence;
  /** The latest successful updates, newest first (bounded). */
  readonly versions: readonly VersionStep[];
}

export interface ProviderStats {
  readonly providerId: string;
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
  readonly medianUpdateMs: number | null;
  /** Median of this provider's own scan time; null until a scan measured it. */
  readonly medianScanMs: number | null;
  readonly scanErrors: number;
  readonly lastScanError?: string;
}

/** Outdated packages the last full scan of a day found. */
export interface TrendPoint {
  readonly day: DayKey;
  readonly outdated: number;
}

/** Failed attempts of one package that failed for the same reason. */
export interface FailureGroup {
  readonly providerId: string;
  readonly packageId: string;
  /** First line of the message, whitespace collapsed, bounded. */
  readonly message: string;
  readonly count: number;
  readonly lastAt: string;
}

/** One gup process (one `runId`): what it scanned and updated. */
export interface RunSummary {
  readonly runId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly trigger?: RunTrigger;
  readonly gup: string;
  readonly platform: string;
  readonly scans: number;
  /** Outdated count of the run's last full scan. */
  readonly lastOutdated: number | null;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
}

export interface InsightTotals {
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
  /** Distinct packages updated successfully at least once. */
  readonly distinctPackages: number;
  readonly scans: number;
  /** successes / (successes + failures) — skips are not failures; null without either. */
  readonly successRate: number | null;
  readonly lastUpdateAt: string | null;
  readonly lastScanAt: string | null;
  /** Outdated count of the last full scan. */
  readonly lastOutdated: number | null;
}

export interface Insights {
  readonly period: Period;
  readonly totals: InsightTotals;
  /** Days with activity only, oldest first. */
  readonly days: readonly DayActivity[];
  readonly weeks: readonly WeekActivity[];
  /** Most successes first, then most recent. */
  readonly recurrence: readonly PackageRecurrence[];
  /** Most attempts first. */
  readonly providers: readonly ProviderStats[];
  readonly trend: readonly TrendPoint[];
  /** Most frequent first. */
  readonly failures: readonly FailureGroup[];
  /** Newest first. */
  readonly runs: readonly RunSummary[];
}

/** An event with its instant and local day, computed once for every builder. */
export interface Timed<E> {
  readonly event: E;
  readonly at: number;
  readonly day: DayKey;
}

export type TimedUpdate = Timed<UpdateEvent>;
export type TimedScan = Timed<ScanEvent>;
