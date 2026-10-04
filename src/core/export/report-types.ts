import type { HistoryReadStats } from "../history/reader.js";
import type { Cadence, InsightTotals } from "../insights/types.js";
import type { RunTrigger } from "../state/run-context.js";
import type { DayKey } from "../time/calendar.js";

/**
 * The data of the HTML report: the period's insights plus every update
 * attempt, in a compact, dictionary-encoded shape the browser decodes. Free
 * text (versions, messages, retry labels, scan errors) lives once in
 * `strings` and is referenced by index; an update attempt is a fixed-order
 * tuple rather than an object, which keeps 50 000 attempts to a couple of
 * megabytes of JSON.
 *
 * Instants are epoch milliseconds; days are local `YYYY-MM-DD` keys of the
 * machine that generated the report (its zone is `meta.timeZone`).
 */

export const REPORT_SCHEMA_VERSION = 1;

/** An absent string or reference inside a tuple or a record. */
export const NONE = -1;

/** Outcome of an attempt, as stored in an {@link UpdateRow}. */
export const STATUS_CODES = { success: 0, failed: 1, skipped: 2 } as const;
export type StatusCode = (typeof STATUS_CODES)[keyof typeof STATUS_CODES];

/** Bit flags of an {@link UpdateRow}. */
export const UPDATE_FLAGS = { retry: 1, elevated: 2, scheduled: 4 } as const;

/** Positions inside an {@link UpdateRow}; the client decodes with the same table. */
export const UPDATE_ROW = {
  at: 0,
  package: 1,
  status: 2,
  from: 3,
  to: 4,
  durationMs: 5,
  message: 6,
  run: 7,
  flags: 8,
  retry: 9,
} as const;

/**
 * One update attempt: `[at, package, status, from, to, durationMs, message,
 * run, flags, retry]` — `package` indexes `packages`, `run` indexes `runs`,
 * the text fields index `strings`; {@link NONE} when absent.
 */
export type UpdateRow = readonly [
  at: number,
  pkg: number,
  status: StatusCode,
  from: number,
  to: number,
  durationMs: number,
  message: number,
  run: number,
  flags: number,
  retry: number,
];

/** `[day, successes, failures, skips, scans]`; a week row holds its Monday. */
export type DayRow = readonly [
  day: DayKey,
  success: number,
  failed: number,
  skipped: number,
  scans: number,
];

/** `[day, outdated]`: the last full scan of the day. */
export type TrendRow = readonly [day: DayKey, outdated: number];

/** The Intl locales a report is written in: one per interface language. */
export type ReportIntlLocale = "en-US" | "fr-FR";

export interface ReportPeriod {
  /** `12m`, `all`, `2026-01-01`. */
  readonly key: string;
  /** The period as the interface words it ("12 derniers mois" in French). */
  readonly label: string;
  /** The period opening a sentence ("Sur les 12 derniers mois" in French). */
  readonly lead: string;
  readonly since: string | null;
  readonly until: string;
  /** Local day of `since`; null for the whole history. */
  readonly firstDay: DayKey | null;
  /** Local day of `until`. */
  readonly lastDay: DayKey;
}

export interface ReportMeta {
  readonly generatedAt: string;
  readonly gup: string;
  readonly platform: string;
  /** IANA zone the days were computed in, so the report reads the same anywhere. */
  readonly timeZone: string;
  /**
   * The Intl locale of the language the report is written in: its client
   * picks plurals and writes numbers and dates with it, whatever the browser.
   */
  readonly locale: ReportIntlLocale;
  readonly period: ReportPeriod;
  readonly stats: HistoryReadStats;
}

export interface ReportProvider {
  readonly id: string;
  readonly name: string;
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
  readonly medianUpdateMs: number | null;
  readonly medianScanMs: number | null;
  readonly scanErrors: number;
  /** `strings` index of the last scan error. */
  readonly lastScanError: number;
}

export interface ReportPackage {
  /** `providers` index. */
  readonly provider: number;
  readonly id: string;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
  readonly firstAt: number;
  readonly lastAt: number;
  /** `strings` index of the version the last success installed. */
  readonly lastVersion: number;
  readonly medianIntervalDays: number | null;
  readonly cadence: Cadence;
}

export interface ReportRun {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly trigger: RunTrigger | null;
  readonly scans: number;
  readonly lastOutdated: number | null;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
}

export interface ReportFailure {
  /** `packages` index. */
  readonly package: number;
  /** `strings` index of the message's first line. */
  readonly message: number;
  readonly count: number;
  readonly lastAt: number;
}

export interface ReportModel {
  readonly schema: typeof REPORT_SCHEMA_VERSION;
  readonly meta: ReportMeta;
  readonly totals: InsightTotals;
  readonly strings: readonly string[];
  /** Most attempts first. */
  readonly providers: readonly ReportProvider[];
  /** Most successes first, then most recent. */
  readonly packages: readonly ReportPackage[];
  /** Newest first. */
  readonly runs: readonly ReportRun[];
  /** Newest first, at most `MAX_REPORT_UPDATES`. */
  readonly updates: readonly UpdateRow[];
  /** Days with activity, oldest first. */
  readonly days: readonly DayRow[];
  readonly weeks: readonly DayRow[];
  readonly trend: readonly TrendRow[];
  /** Most frequent first. */
  readonly failures: readonly ReportFailure[];
  /** Update attempts left out by the cap (0: none). */
  readonly truncated: number;
}
