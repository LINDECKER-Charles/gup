import type { UpdateEvent, UpdateStatus } from "../../../../src/core/history/types.js";
import { SCHEDULES_FIXTURE, type FixtureSchedule } from "../schedules/schedule-data.js";
import {
  FORCE_RETRY_LABEL,
  HASH_MISMATCH_MESSAGE,
  STORE_SKIP_MESSAGE,
  UPDATE_RULES,
  type UpdateRule,
} from "./activity-rules.js";
import { atLocalTime, type FixtureDay } from "./fixture-days.js";
import { envelope, scheduledSession, sessionOf, type Session } from "./history-envelope.js";
import { versionSteps, type VersionStep } from "./version-walk.js";

/** One attempt before its versions are known: they are walked back per package. */
interface Attempt {
  readonly rule: UpdateRule;
  readonly at: Date;
  readonly status: UpdateStatus;
  readonly session: Session;
  readonly durationMs?: number;
  readonly message?: string;
  readonly retry?: string;
  readonly elevated?: true;
  readonly scheduleId?: string;
}

/** One occurrence of a rule: the day, and how many active occurrences came before. */
interface Occurrence {
  readonly rule: UpdateRule;
  readonly day: FixtureDay;
  readonly nth: number;
}

/** Updates come a few minutes after the morning scan, one rule a minute. */
const UPDATE_HOUR = 9;
const FIRST_UPDATE_MINUTE = 5;
const SKIPPED_EVERY = 3;
const DURATION_SPREAD_MS = 1_000;
const DURATION_STEP_MS = 97;
const SECONDS_PER_MINUTE = 60;
const SECOND_STEP = 7;
/** Seconds between two updates of one scheduled run. */
const SCHEDULED_STEP_MS = 20_000;

/**
 * Every update attempt of the year: the user's habits (`UPDATE_RULES`, on
 * the days they used gup) and the schedules' last runs, with versions that
 * end where the machine is today.
 */
export function updateHistory(days: readonly FixtureDay[]): UpdateEvent[] {
  const attempts = [
    ...occurrences(days).flatMap((occurrence) => attemptsOf(occurrence, days)),
    ...SCHEDULES_FIXTURE.flatMap(scheduledAttempts),
  ];
  return UPDATE_RULES.flatMap((rule) => withVersions(attempts.filter((a) => a.rule === rule)));
}

/**
 * Each rule's occurrences. One due on a day the user did not use gup (a
 * Sunday, the holiday) happens the next day they did; several due over the
 * holiday make one update when they come back.
 */
function occurrences(days: readonly FixtureDay[]): Occurrence[] {
  return UPDATE_RULES.flatMap((rule) => {
    const due = days
      .filter((day) => day.index >= rule.offsetDays)
      .filter((day) => (day.index - rule.offsetDays) % rule.everyDays === 0)
      .map((day) => firstActiveFrom(day.index, days))
      .filter((day): day is FixtureDay => day !== undefined);
    return [...new Set(due)].map((day, nth) => ({ rule, day, nth }));
  });
}

/** The first day from `index` on that the user used gup. */
function firstActiveFrom(index: number, days: readonly FixtureDay[]): FixtureDay | undefined {
  return days.slice(index).find((day) => day.isActive);
}

function attemptsOf(occurrence: Occurrence, days: readonly FixtureDay[]): Attempt[] {
  const attempt = attemptOn(occurrence);
  switch (occurrence.rule.pattern) {
    case "store-skip":
      return occurrence.nth % SKIPPED_EVERY === SKIPPED_EVERY - 1
        ? [{ ...attempt, status: "skipped", message: STORE_SKIP_MESSAGE }]
        : [attempt];
    case "fail-then-force": {
      const retryDay = nextActiveDay(occurrence.day, days);
      return [
        { ...attempt, status: "failed", message: HASH_MISMATCH_MESSAGE },
        { ...attemptOn({ ...occurrence, day: retryDay }), retry: FORCE_RETRY_LABEL },
      ];
    }
    case "elevated":
      return [{ ...withoutDuration(attempt), elevated: true }];
    default:
      return [attempt];
  }
}

function attemptOn({ rule, day, nth }: Occurrence): Attempt {
  const minute = FIRST_UPDATE_MINUTE + UPDATE_RULES.indexOf(rule);
  const second = (nth * SECOND_STEP) % SECONDS_PER_MINUTE;
  return {
    rule,
    at: atLocalTime(day, { hour: UPDATE_HOUR, minute, second }),
    status: "success",
    session: sessionOf(day),
    durationMs: rule.baseMs + ((nth * DURATION_STEP_MS) % DURATION_SPREAD_MS),
  };
}

/** Where a failure's retry happens: the next day the user used gup. */
function nextActiveDay(day: FixtureDay, days: readonly FixtureDay[]): FixtureDay {
  return firstActiveFrom(day.index + 1, days) ?? day;
}

function withoutDuration({ durationMs: _durationMs, ...attempt }: Attempt): Attempt {
  return attempt;
}

/** The packages a schedule's last run updated, as that run recorded them. */
function scheduledAttempts({ id, lastRun }: FixtureSchedule): Attempt[] {
  const startedAt = new Date(lastRun.startedAt);
  const session = scheduledSession(startedAt, id);
  return lastRun.targets
    .filter((target) => target.status === "updated")
    .map((target, index): Attempt => {
      const rule = ruleFor(target.target);
      return {
        rule,
        at: new Date(startedAt.getTime() + (index + 1) * SCHEDULED_STEP_MS),
        status: "success",
        session,
        durationMs: rule.baseMs,
        scheduleId: id,
      };
    });
}

function ruleFor(target: string): UpdateRule {
  const isTarget = (rule: UpdateRule): boolean => `${rule.providerId}:${rule.packageId}` === target;
  const rule = UPDATE_RULES.find(isTarget);
  if (!rule) throw new Error(`no update rule for the scheduled target ${target}`);
  return rule;
}

/** One package's attempts, oldest first, with the versions they went from and to. */
function withVersions(attempts: readonly Attempt[]): UpdateEvent[] {
  const ordered = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const [first] = ordered;
  if (!first) return [];
  const steps = versionSteps(
    ordered.map((attempt) => attempt.status === "success"),
    first.rule,
  );
  return ordered.map((attempt, index) => toEvent(attempt, steps[index]));
}

function toEvent(attempt: Attempt, step: VersionStep | undefined): UpdateEvent {
  const { rule, durationMs, message, retry, elevated, scheduleId } = attempt;
  return {
    ...envelope(attempt.at, attempt.session),
    kind: "update",
    providerId: rule.providerId,
    packageId: rule.packageId,
    status: attempt.status,
    ...step,
    ...(durationMs !== undefined && { durationMs }),
    ...(message !== undefined && { message }),
    ...(retry !== undefined && { retry }),
    ...(elevated && { elevated }),
    ...(scheduleId !== undefined && { scheduleId }),
  };
}
