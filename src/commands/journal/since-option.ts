/**
 * The `--since` value of the `gup log` commands: a span back from now
 * (`7d`, `12w`, `6m`, `1y`), a calendar date (`2026-09-28`, local midnight),
 * or `all`. Months and years are calendar-based and clamp to the month's last
 * day (31 March − 1m = 28/29 February).
 *
 * The journal branch generalises this into `core/time/period.ts` (`--since`
 * of `gup report`); until then the log commands own their parser.
 */

export type SinceValue =
  | { readonly isValid: true; readonly since: Date | null }
  | { readonly isValid: false };

const RELATIVE = /^(\d{1,4})([dwmy])$/;
const ABSOLUTE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALL = "all";
/** Spans past about ten years are refused (each unit counted in whole days). */
const MAX_SPAN_DAYS = 3650;
const DAYS_PER_UNIT = { d: 1, w: 7, m: 30, y: 365 } as const;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

const INVALID: SinceValue = { isValid: false };

export function parseSince(raw: string, now: Date): SinceValue {
  const value = raw.trim().toLowerCase();
  if (value === ALL) return { isValid: true, since: null };
  const relative = RELATIVE.exec(value);
  if (relative) return relativeSince(Number(relative[1]), relative[2] as Unit, now);
  const absolute = ABSOLUTE.exec(value);
  return absolute ? absoluteSince(absolute.slice(1).map(Number), now) : INVALID;
}

type Unit = keyof typeof DAYS_PER_UNIT;

function relativeSince(count: number, unit: Unit, now: Date): SinceValue {
  if (count < 1 || count * DAYS_PER_UNIT[unit] > MAX_SPAN_DAYS) return INVALID;
  if (unit === "m") return { isValid: true, since: monthsBefore(now, count) };
  if (unit === "y") return { isValid: true, since: monthsBefore(now, count * MONTHS_PER_YEAR) };
  const since = new Date(now);
  since.setDate(since.getDate() - count * (unit === "w" ? DAYS_PER_WEEK : 1));
  return { isValid: true, since };
}

function monthsBefore(now: Date, months: number): Date {
  const since = new Date(now);
  since.setDate(1);
  since.setMonth(since.getMonth() - months);
  const lastDay = new Date(since.getFullYear(), since.getMonth() + 1, 0).getDate();
  since.setDate(Math.min(now.getDate(), lastDay));
  return since;
}

/** A real calendar date (no 31 February), not in the future. */
function absoluteSince([year = 0, month = 0, day = 0]: number[], now: Date): SinceValue {
  const since = new Date(year, month - 1, day);
  const isReal =
    since.getFullYear() === year && since.getMonth() === month - 1 && since.getDate() === day;
  return isReal && since.getTime() <= now.getTime() ? { isValid: true, since } : INVALID;
}
