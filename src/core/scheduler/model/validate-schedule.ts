import { localized } from "../../i18n/localized.js";
import { CronExpression } from "./cron.js";
import { toCron } from "./recurrence.js";
import {
  hasControlCharacter,
  packageIdProblem,
  TARGET_MESSAGES,
  targetKey,
} from "./schedule-target.js";
import type {
  ProviderFacts,
  Recurrence,
  ScheduleDraft,
  ScheduleTarget,
  TimeOfDay,
} from "./types.js";

/**
 * Everything that makes a draft unschedulable, in the interface's languages,
 * field by field — the CLI prints them, the editor shows each under its
 * field. A schedule is a short list of packages updated at most hourly, by
 * providers that can update without an administrator.
 */

/** Updating a package more often than hourly only hammers its registry. */
export const MIN_INTERVAL_MINUTES = 60;
/** Upcoming occurrences inspected for the minimum interval. */
export const MIN_INTERVAL_SAMPLE = 24;
/** An expression must fire within this horizon. */
export const MAX_HORIZON_DAYS = 366;
/** Keeps "check everything, schedule it" from becoming a provider-wide schedule. */
export const MAX_TARGETS_PER_SCHEDULE = 50;
export const MAX_SCHEDULES = 50;
export const MAX_NAME_LENGTH = 60;
/** Longest custom cron expression, blanks collapsed — the bound the schedules file reads back. */
export const MAX_CRON_LENGTH = 120;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MONTH_DAY = 28;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MAX_WEEKDAY = 6;

export const VALIDATION_MESSAGES = localized({
  en: {
    tooFrequent: "Too frequent — at most one run per hour",
    invalidTime: "invalid time (HH:MM expected)",
    /** The name of a schedule that has no target to be named after yet. */
    unnamed: "schedule",
    nameRequired: "name required",
    nameTooLong: (max: number) => `${max} characters at most`,
    notWithinYear: "this expression does not fire within the coming year",
    invalidWeekday: "invalid day of the week",
    invalidMonthDay: (max: number) => `invalid day of the month (1 to ${max}, or the last)`,
    cronRequired: "cron expression required",
    cronTooLong: (max: number) => `cron expression too long (${max} characters at most)`,
    noTarget: "at least one package required",
    tooManyTargets: (max: number) => `${max} packages at most per schedule`,
    duplicateTarget: "duplicate package",
    adminOnly: (name: string) =>
      `"${name}" asks for sudo/admin on every update: cannot be scheduled`,
    tooManySchedules: (max: number) => `${max} schedules at most`,
  },
  fr: {
    tooFrequent: "Fréquence trop élevée — au plus une exécution par heure",
    invalidTime: "heure invalide (HH:MM attendu)",
    unnamed: "planification",
    nameRequired: "nom requis",
    nameTooLong: (max) => `${max} caractères au plus`,
    notWithinYear: "cette expression ne se déclenche pas dans l'année à venir",
    invalidWeekday: "jour de la semaine invalide",
    invalidMonthDay: (max) => `jour du mois invalide (1 à ${max}, ou le dernier)`,
    cronRequired: "expression cron requise",
    cronTooLong: (max) => `expression cron trop longue (${max} caractères au plus)`,
    noTarget: "au moins un paquet requis",
    tooManyTargets: (max) => `${max} paquets au plus par planification`,
    duplicateTarget: "paquet en double",
    adminOnly: (name) =>
      `« ${name} » demande sudo/admin à chaque mise à jour : non planifiable`,
    tooManySchedules: (max) => `${max} planifications au plus`,
  },
});

/** Its packages installed machine-wide may ask for UAC. */
const UAC_PRONE_PROVIDER = "winget";

export type IssueField = "name" | "recurrence" | "targets" | "schedules" | `target:${number}`;

export interface ValidationIssue {
  readonly field: IssueField;
  readonly message: string;
}

export interface ValidationContext {
  readonly now: Date;
  readonly providers: ProviderFacts;
  /** Schedules that exist besides this one. */
  readonly existingCount: number;
}

export function validateDraft(
  draft: ScheduleDraft,
  context: ValidationContext,
): readonly ValidationIssue[] {
  const issues = [...scheduleIssues(draft, context.now)];
  const isRunnable = !issues.some((issue) => issue.field === "recurrence");
  const horizon = isRunnable ? horizonProblem(draft.recurrence, context.now) : null;
  if (horizon) issues.push({ field: "recurrence", message: horizon });
  issues.push(...targetIssues(draft.targets, context.providers));
  if (context.existingCount >= MAX_SCHEDULES) {
    const message = VALIDATION_MESSAGES.tooManySchedules(MAX_SCHEDULES);
    issues.push({ field: "schedules", message });
  }
  return issues;
}

/**
 * What makes a schedule unrunnable as a whole, seen from `now`: its name and
 * its recurrence, the hourly minimum included. The tick asks it again of
 * every schedule it reads, since a hand-edited `schedules.json` gets past
 * the editor and the CLI; a target's own problem (a provider unknown here,
 * one that needs an administrator) only skips that target at run time.
 *
 * The one-year horizon is not part of it: only a new or edited schedule must
 * fire within a year. Seen from the tick that runs it, a schedule's next
 * occurrence may lie years ahead — 29 February's comes back in four.
 */
export function scheduleIssues(
  schedule: Pick<ScheduleDraft, "name" | "recurrence">,
  now: Date,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const name = nameProblem(schedule.name);
  if (name) issues.push({ field: "name", message: name });
  const recurrence = recurrenceProblem(schedule.recurrence, now);
  if (recurrence) issues.push({ field: "recurrence", message: recurrence });
  return issues;
}

/** "Git.Git", "Git.Git +2" — the first package and how many others, within the name limit. */
export function defaultScheduleName(targets: readonly ScheduleTarget[]): string {
  const [first] = targets;
  const rest = targets.length - 1;
  const name = `${first?.packageId ?? VALIDATION_MESSAGES.unnamed}${rest > 0 ? ` +${rest}` : ""}`;
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

/**
 * A warning, not a refusal (amendment S-1): a winget package installed for
 * every user may ask for UAC at run time, and a scheduled run never
 * elevates — that package would then be skipped.
 */
export function mayAskForUac(targets: readonly ScheduleTarget[]): boolean {
  return targets.some((target) => target.providerId === UAC_PRONE_PROVIDER);
}

function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return VALIDATION_MESSAGES.nameRequired;
  if (trimmed.length > MAX_NAME_LENGTH) return VALIDATION_MESSAGES.nameTooLong(MAX_NAME_LENGTH);
  if (hasControlCharacter(trimmed)) return TARGET_MESSAGES.controlCharacter;
  return null;
}

/** Why `recurrence` cannot drive a schedule, or null: its shape, its syntax, the hourly minimum. */
function recurrenceProblem(recurrence: Recurrence, now: Date): string | null {
  const shape = shapeProblem(recurrence);
  if (shape) return shape;
  const parsed = CronExpression.tryParse(toCron(recurrence));
  if (!parsed.ok) return parsed.reason;
  if (parsed.cron.minGapMinutes(now, MIN_INTERVAL_SAMPLE) < MIN_INTERVAL_MINUTES) {
    return VALIDATION_MESSAGES.tooFrequent;
  }
  return null;
}

/** Why a runnable `recurrence` set at `now` would not fire within a year, or null. */
function horizonProblem(recurrence: Recurrence, now: Date): string | null {
  const parsed = CronExpression.tryParse(toCron(recurrence));
  const next = parsed.ok ? parsed.cron.nextRun(now) : null;
  if (next === null || next.getTime() - now.getTime() > MAX_HORIZON_DAYS * DAY_MS) {
    return VALIDATION_MESSAGES.notWithinYear;
  }
  return null;
}

function shapeProblem(recurrence: Recurrence): string | null {
  if (recurrence.kind === "cron") return expressionProblem(toCron(recurrence));
  if (!isTimeOfDay(recurrence.at)) return VALIDATION_MESSAGES.invalidTime;
  if (recurrence.kind === "weekly" && !isInRange(recurrence.weekday, 0, MAX_WEEKDAY)) {
    return VALIDATION_MESSAGES.invalidWeekday;
  }
  if (recurrence.kind === "monthly" && recurrence.day !== "last") {
    if (!isInRange(recurrence.day, 1, MAX_MONTH_DAY)) {
      return VALIDATION_MESSAGES.invalidMonthDay(MAX_MONTH_DAY);
    }
  }
  return null;
}

/** A custom expression, blanks collapsed as it is stored and evaluated. */
function expressionProblem(expression: string): string | null {
  if (expression === "") return VALIDATION_MESSAGES.cronRequired;
  if (expression.length > MAX_CRON_LENGTH) {
    return VALIDATION_MESSAGES.cronTooLong(MAX_CRON_LENGTH);
  }
  return null;
}

function isTimeOfDay(at: TimeOfDay): boolean {
  return isInRange(at.hour, 0, MAX_HOUR) && isInRange(at.minute, 0, MAX_MINUTE);
}

function isInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function targetIssues(
  targets: readonly ScheduleTarget[],
  providers: ProviderFacts,
): ValidationIssue[] {
  if (targets.length === 0) {
    return [{ field: "targets", message: VALIDATION_MESSAGES.noTarget }];
  }
  if (targets.length > MAX_TARGETS_PER_SCHEDULE) {
    const message = VALIDATION_MESSAGES.tooManyTargets(MAX_TARGETS_PER_SCHEDULE);
    return [{ field: "targets", message }];
  }
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  targets.forEach((target, index) => {
    const key = targetKey(target).toLowerCase();
    const problem = seen.has(key)
      ? VALIDATION_MESSAGES.duplicateTarget
      : targetProblem(target, providers);
    seen.add(key);
    if (problem) issues.push({ field: `target:${index}`, message: problem });
  });
  return issues;
}

function targetProblem(target: ScheduleTarget, providers: ProviderFacts): string | null {
  const packageProblem = packageIdProblem(target.packageId);
  if (packageProblem) return packageProblem;
  const fact = providers.lookup(target.providerId);
  if (!fact.isFound) return fact.error;
  if (!fact.canUpdateUnattended) return VALIDATION_MESSAGES.adminOnly(fact.displayName);
  return null;
}
