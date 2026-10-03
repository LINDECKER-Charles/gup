/**
 * Calendar days in local time, as the journal shows them: a day is the
 * user's day (a 23:30 update belongs to that evening, not to tomorrow's UTC
 * date), weeks start on Monday.
 *
 * Days travel as `YYYY-MM-DD` keys: they sort as strings, compare as
 * strings, and serve as map keys without a Date in sight. Day arithmetic
 * goes through UTC noon, so a DST change (a 23- or 25-hour day) never shifts
 * a key.
 */

/** `YYYY-MM-DD`, local calendar. */
export type DayKey = string;

const MS_PER_DAY = 86_400_000;
const NOON_UTC_HOUR = 12;
const DAYS_PER_WEEK = 7;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** The local calendar day of `date`. */
export function dayKeyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `day` moved by `delta` days (negative: back). */
export function addDays(day: DayKey, delta: number): DayKey {
  const noon = noonOf(day) + delta * MS_PER_DAY;
  return new Date(noon).toISOString().slice(0, 10);
}

/** Day of the week, Monday first: 0 Monday … 6 Sunday. */
export function weekdayOf(day: DayKey): number {
  return (new Date(noonOf(day)).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

/** The Monday of `day`'s week. */
export function weekStartOf(day: DayKey): DayKey {
  return addDays(day, -weekdayOf(day));
}

/** Negative when `a` is before `b`, 0 on the same day. */
export function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((noonOf(to) - noonOf(from)) / MS_PER_DAY);
}

/** The day of the month, 1-based. */
export function dayOfMonth(day: DayKey): number {
  return Number(day.slice(8, 10));
}

/** The month, 0-based (January = 0), as `Date#getMonth`. */
export function monthOf(day: DayKey): number {
  return Number(day.slice(5, 7)) - 1;
}

/** Noon UTC of the calendar day, the anchor of every computation here. */
function noonOf(day: DayKey): number {
  const parts = DAY_KEY.exec(day);
  if (!parts) throw new RangeError(`not a day key: ${day}`);
  const [, year, month, date] = parts;
  return Date.UTC(Number(year), Number(month) - 1, Number(date), NOON_UTC_HOUR);
}
