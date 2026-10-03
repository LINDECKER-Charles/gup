import type { Recurrence } from "./types.js";

/**
 * Every recurrence as the 5-field cron expression the scheduler evaluates
 * (minute hour day-of-month month day-of-week). Presets are written in the
 * plainest form croner and every cron agree on; a custom expression is kept
 * as typed, whitespace normalised.
 */

/** Last day of the month, in the day-of-month field. */
const LAST_DAY = "L";

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
export function normalizeCron(expression: string): string {
  return expression.trim().split(/\s+/).join(" ");
}
