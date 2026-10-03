import { CronExpression } from "./cron.js";
import type { MonthDay, Recurrence, TimeOfDay } from "./types.js";

/**
 * Every recurrence as the 5-field cron expression the scheduler evaluates
 * (minute hour day-of-month month day-of-week). Presets are written in the
 * plainest form croner and every cron agree on; a custom expression is kept
 * as typed, whitespace normalised.
 */

/** Last day of the month, in the day-of-month field. */
const LAST_DAY = "L";

/** The time of a preset when none is given. */
export const DEFAULT_TIME: TimeOfDay = { hour: 9, minute: 0 };

/** Occurrences a preview shows, on the command line and in the menu. */
export const PREVIEW_RUNS = 3;

const TIME = /^(\d{1,2}):(\d{2})$/;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
/** 1 to 28: the days every month has. */
const MONTH_DAY = /^(?:[1-9]|1\d|2[0-8])$/;
const LAST_DAY_WORDS = new Set(["dernier", "last"]);

export function toCron(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case "daily":
      return `${recurrence.at.minute} ${recurrence.at.hour} * * *`;
    case "weekly":
      return `${recurrence.at.minute} ${recurrence.at.hour} * * ${recurrence.weekday}`;
    case "monthly": {
      const day = recurrence.day === "last" ? LAST_DAY : String(recurrence.day);
      return `${recurrence.at.minute} ${recurrence.at.hour} ${day} * *`;
    }
    case "cron":
      return normalizeCron(recurrence.expression);
  }
}

/** Fields separated by single spaces, no leading or trailing blanks. */
function normalizeCron(expression: string): string {
  return expression.trim().split(/\s+/).join(" ");
}

/** The next `count` occurrences after `from` (none for an invalid expression), for previews. */
export function upcomingRuns(recurrence: Recurrence, from: Date, count: number): Date[] {
  const parsed = CronExpression.tryParse(toCron(recurrence));
  return parsed.ok ? parsed.cron.nextRuns(from, count) : [];
}

/** "HH:MM" or "H:MM" (24-hour clock) → that time of day; null when malformed. */
export function parseTimeOfDay(text: string): TimeOfDay | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > MAX_HOUR || minute > MAX_MINUTE ? null : { hour, minute };
}

/** "1"…"28", or "dernier" / "last" → that day of the month; null otherwise. */
export function parseMonthDay(text: string): MonthDay | null {
  const word = text.trim().toLowerCase();
  if (LAST_DAY_WORDS.has(word)) return "last";
  return MONTH_DAY.test(word) ? Number(word) : null;
}
