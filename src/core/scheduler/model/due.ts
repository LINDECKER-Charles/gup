import { CronExpression } from "./cron.js";
import { toCron } from "./recurrence.js";
import type { Schedule, ScheduleRunState } from "./types.js";

/**
 * Whether a schedule has an occurrence to run now. Pure: the clock, the
 * schedule and its run state are the whole input.
 *
 * The anchor is the later of the schedule's arming and its last consumed
 * occurrence, never later than `now` (a clock set backwards cannot freeze a
 * schedule). The first occurrence after the anchor decides: still ahead →
 * not due; passed → the latest passed occurrence runs once, on time when it
 * is recent, as a catch-up otherwise (or is recorded as missed when the
 * schedule opts out). Consuming sets the anchor to `now`, so any number of
 * missed windows collapse into a single run.
 */

export type DueVerdict =
  | { readonly kind: "not-due"; readonly nextRun: Date | null }
  | { readonly kind: "due"; readonly runKind: "on-time" | "catch-up"; readonly occurrence: Date }
  | { readonly kind: "missed"; readonly occurrence: Date };

export interface DueInput {
  readonly schedule: Schedule;
  readonly state: ScheduleRunState | undefined;
  readonly now: Date;
}

export interface DuePolicy {
  /** How late a tick may come and still count as on time. */
  readonly onTimeGraceMs: number;
}

export function evaluateDue(input: DueInput, policy: DuePolicy): DueVerdict {
  const { schedule, state, now } = input;
  if (!schedule.enabled) return { kind: "not-due", nextRun: null };
  const parsed = CronExpression.tryParse(toCron(schedule.recurrence));
  if (!parsed.ok) return { kind: "not-due", nextRun: null };
  const next = parsed.cron.nextRun(anchorOf(schedule, state, now));
  if (next === null || next.getTime() > now.getTime()) return { kind: "not-due", nextRun: next };
  const occurrence = parsed.cron.latestRun(now) ?? next;
  if (now.getTime() - occurrence.getTime() <= policy.onTimeGraceMs) {
    return { kind: "due", runKind: "on-time", occurrence };
  }
  if (schedule.options.catchUp) return { kind: "due", runKind: "catch-up", occurrence };
  return { kind: "missed", occurrence };
}

/** min(now, max(armedAt, lastAttemptAt)) — unparsable dates count as absent. */
function anchorOf(schedule: Schedule, state: ScheduleRunState | undefined, now: Date): Date {
  const armed = timeOf(schedule.armedAt) ?? now.getTime();
  const attempted = timeOf(state?.lastAttemptAt) ?? armed;
  return new Date(Math.min(now.getTime(), Math.max(armed, attempted)));
}

function timeOf(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}
