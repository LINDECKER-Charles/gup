import { CronExpression } from "./cron.js";
import { toCron } from "./recurrence.js";
import { hasControlCharacter, packageIdProblem, targetKey } from "./schedule-target.js";
import type {
  ProviderFacts,
  Recurrence,
  ScheduleDraft,
  ScheduleTarget,
  TimeOfDay,
} from "./types.js";

/**
 * Everything that makes a draft unschedulable, in French, field by field —
 * the CLI prints them, the editor shows each under its field. A schedule is
 * a short list of packages updated at most hourly, by providers that can
 * update without an administrator.
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

export const TOO_FREQUENT = "Fréquence trop élevée — au plus une exécution par heure";
export const INVALID_TIME = "heure invalide (HH:MM attendu)";
/** The name of a schedule that has no target to be named after yet. */
const UNNAMED = "planification";
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
  issues.push(...targetIssues(draft.targets, context.providers));
  if (context.existingCount >= MAX_SCHEDULES) {
    issues.push({ field: "schedules", message: `${MAX_SCHEDULES} planifications au plus` });
  }
  return issues;
}

/**
 * What makes a schedule unrunnable as a whole, seen from `now`: its name and
 * its recurrence, the hourly minimum included. The tick asks it again of
 * every schedule it reads, since a hand-edited `schedules.json` gets past
 * the editor and the CLI; a target's own problem (a provider unknown here,
 * one that needs an administrator) only skips that target at run time.
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
  const name = `${first?.packageId ?? UNNAMED}${rest > 0 ? ` +${rest}` : ""}`;
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
  if (trimmed === "") return "nom requis";
  if (trimmed.length > MAX_NAME_LENGTH) return `${MAX_NAME_LENGTH} caractères au plus`;
  if (hasControlCharacter(trimmed)) return "caractère de contrôle interdit";
  return null;
}

/** Why `recurrence` cannot drive a schedule from `now` on, or null. */
function recurrenceProblem(recurrence: Recurrence, now: Date): string | null {
  const shape = shapeProblem(recurrence);
  if (shape) return shape;
  const parsed = CronExpression.tryParse(toCron(recurrence));
  if (!parsed.ok) return parsed.reason;
  const next = parsed.cron.nextRun(now);
  if (next === null || next.getTime() - now.getTime() > MAX_HORIZON_DAYS * DAY_MS) {
    return "cette expression ne se déclenche pas dans l'année à venir";
  }
  if (parsed.cron.minGapMinutes(now, MIN_INTERVAL_SAMPLE) < MIN_INTERVAL_MINUTES) {
    return TOO_FREQUENT;
  }
  return null;
}

function shapeProblem(recurrence: Recurrence): string | null {
  if (recurrence.kind === "cron") return expressionProblem(toCron(recurrence));
  if (!isTimeOfDay(recurrence.at)) return INVALID_TIME;
  if (recurrence.kind === "weekly" && !isInRange(recurrence.weekday, 0, MAX_WEEKDAY)) {
    return "jour de la semaine invalide";
  }
  if (recurrence.kind === "monthly" && recurrence.day !== "last") {
    if (!isInRange(recurrence.day, 1, MAX_MONTH_DAY)) {
      return `jour du mois invalide (1 à ${MAX_MONTH_DAY}, ou le dernier)`;
    }
  }
  return null;
}

/** A custom expression, blanks collapsed as it is stored and evaluated. */
function expressionProblem(expression: string): string | null {
  if (expression === "") return "expression cron requise";
  if (expression.length > MAX_CRON_LENGTH) {
    return `expression cron trop longue (${MAX_CRON_LENGTH} caractères au plus)`;
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
  if (targets.length === 0) return [{ field: "targets", message: "au moins un paquet requis" }];
  if (targets.length > MAX_TARGETS_PER_SCHEDULE) {
    const message = `${MAX_TARGETS_PER_SCHEDULE} paquets au plus par planification`;
    return [{ field: "targets", message }];
  }
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  targets.forEach((target, index) => {
    const key = targetKey(target).toLowerCase();
    const problem = seen.has(key) ? "paquet en double" : targetProblem(target, providers);
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
  if (!fact.canUpdateUnattended) {
    return `« ${fact.displayName} » demande sudo/admin à chaque mise à jour : non planifiable`;
  }
  return null;
}
