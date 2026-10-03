/**
 * The stretch of time a journal, a report or a log export covers: a span
 * back from now (`7d`, `12w`, `6m`, `1y`), a calendar date onwards
 * (`2026-09-28`, from its local midnight), or everything (`all`). Months and
 * years are calendar-based and clamp to the month's last day
 * (31 March − 1m = 28/29 February).
 *
 * A period is plain data with its own description (`scope`): the interface
 * words it ("12 derniers mois") without parsing the key again.
 */

export type PeriodUnit = "d" | "w" | "m" | "y";

export type PeriodScope =
  | { readonly kind: "all" }
  | { readonly kind: "span"; readonly count: number; readonly unit: PeriodUnit }
  /** From a calendar date on: `since` holds its local midnight. */
  | { readonly kind: "date" };

export interface Period {
  /** Normalised input: `30d`, `all`, `2026-01-01`. */
  readonly key: string;
  readonly scope: PeriodScope;
  /** Oldest instant covered; null: from the beginning. */
  readonly since: Date | null;
  /** Newest instant covered (inclusive). */
  readonly until: Date;
}

/** The periods the journal steps through with `p`, shortest first. */
export const PERIOD_CYCLE = ["30d", "90d", "12m", "all"] as const;
export type PeriodPreset = (typeof PERIOD_CYCLE)[number];

const RELATIVE = /^(\d{1,4})([dwmy])$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALL = "all";
/** Spans past about ten years are refused (each unit counted in whole days). */
const MAX_SPAN_DAYS = 3650;
const DAYS_PER_UNIT: Readonly<Record<PeriodUnit, number>> = { d: 1, w: 7, m: 30, y: 365 };
const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;
const LAST_MS_OF_DAY = { hours: 23, minutes: 59, seconds: 59, ms: 999 } as const;

/** `raw` as a period ending `now`, or null when it is not one. */
export function parsePeriod(raw: string, now: Date): Period | null {
  const key = raw.trim().toLowerCase();
  if (key === ALL) return { key, scope: { kind: "all" }, since: null, until: new Date(now) };
  const relative = RELATIVE.exec(key);
  if (relative) return spanPeriod(Number(relative[1]), relative[2] as PeriodUnit, now);
  const since = calendarDate(key);
  if (since === null || since.getTime() > now.getTime()) return null;
  return { key, scope: { kind: "date" }, since, until: new Date(now) };
}

/** A preset of the cycle as a period ending `now`. */
export function presetPeriod(preset: PeriodPreset, now: Date): Period {
  const period = parsePeriod(preset, now);
  if (period === null) throw new RangeError(`bad period preset: ${preset}`);
  return period;
}

/** The next preset of the cycle after `period` (the first one after a non-preset), ending `now`. */
export function nextPeriod(period: Period, now: Date): Period {
  const index = PERIOD_CYCLE.indexOf(period.key as PeriodPreset);
  const next = PERIOD_CYCLE[(index + 1) % PERIOD_CYCLE.length] ?? PERIOD_CYCLE[0];
  return presetPeriod(next, now);
}

/**
 * A calendar date as the last instant of that local day — the inclusive end
 * of `--until 2026-09-30` — or null when it is not a real date.
 */
export function parseUntil(raw: string): Date | null {
  const day = calendarDate(raw.trim());
  if (day === null) return null;
  const { hours, minutes, seconds, ms } = LAST_MS_OF_DAY;
  day.setHours(hours, minutes, seconds, ms);
  return day;
}

/** `period` ending at `until` instead, or null when it would end before it starts. */
export function withUntil(period: Period, until: Date): Period | null {
  if (period.since !== null && until.getTime() < period.since.getTime()) return null;
  return { ...period, until: new Date(until) };
}

/** Whether the instant `at` (epoch ms) falls within `period`, both ends included. */
export function isWithin(period: Period, at: number): boolean {
  if (period.since !== null && at < period.since.getTime()) return false;
  return at <= period.until.getTime();
}

function spanPeriod(count: number, unit: PeriodUnit, now: Date): Period | null {
  if (count < 1 || count * DAYS_PER_UNIT[unit] > MAX_SPAN_DAYS) return null;
  return {
    key: `${count}${unit}`,
    scope: { kind: "span", count, unit },
    since: spanStart(count, unit, now),
    until: new Date(now),
  };
}

function spanStart(count: number, unit: PeriodUnit, now: Date): Date {
  if (unit === "m") return monthsBefore(now, count);
  if (unit === "y") return monthsBefore(now, count * MONTHS_PER_YEAR);
  const since = new Date(now);
  since.setDate(since.getDate() - count * (unit === "w" ? DAYS_PER_WEEK : 1));
  return since;
}

function monthsBefore(now: Date, months: number): Date {
  const since = new Date(now);
  since.setDate(1);
  since.setMonth(since.getMonth() - months);
  const lastDay = new Date(since.getFullYear(), since.getMonth() + 1, 0).getDate();
  since.setDate(Math.min(now.getDate(), lastDay));
  return since;
}

/** `YYYY-MM-DD` as its local midnight, or null when it is not a real date (no 31 February). */
function calendarDate(raw: string): Date | null {
  const parts = CALENDAR_DATE.exec(raw);
  if (!parts) return null;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  const isReal =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isReal ? date : null;
}
