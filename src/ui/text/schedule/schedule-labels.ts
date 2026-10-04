import { localized } from "../../../core/i18n/localized.js";
import type {
  Recurrence,
  ScheduleRunRecord,
  TargetResult,
  TimeOfDay,
  Weekday,
} from "../../../core/scheduler/model/types.js";
import { TICK_INTERVAL_MINUTES } from "../../../core/scheduler/scheduler-timing.js";
import type { Mechanism } from "../../../core/scheduler/trigger/os-trigger.js";
import type { TriggerHealth } from "../../../core/scheduler/trigger/trigger-health.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { formatDuration, formatRelative } from "../format.js";
import { RUN_SUMMARY } from "../run-labels.js";

/**
 * The scheduler's words, in the interface's languages, shared by
 * `gup schedule` and the menu's Schedules view: recurrences, run results,
 * the OS trigger. Pure; "now" is always passed in.
 */

/** By cron number: 0 is Sunday. */
export const WEEKDAY_NAMES = localized<Readonly<Record<Weekday, string>>>({
  en: {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
  },
  fr: {
    0: "dimanche",
    1: "lundi",
    2: "mardi",
    3: "mercredi",
    4: "jeudi",
    5: "vendredi",
    6: "samedi",
  },
});

export const MECHANISM_LABELS = localized<Readonly<Record<Mechanism, string>>>({
  en: {
    "windows-task": "Windows Task Scheduler",
    launchd: "launchd (macOS user agent)",
    crontab: "your user's crontab",
  },
  fr: {
    "windows-task": "Planificateur de tâches Windows",
    launchd: "launchd (agent utilisateur macOS)",
    crontab: "crontab de votre utilisateur",
  },
});

export const NEVER_RAN = "—";
export const WARNING_MARK = STATUS_GLYPHS.warning;

export const SCHEDULE_LABELS = localized({
  en: {
    /** In place of the next run of a schedule switched off. */
    disabledNextRun: "disabled",
    /** "checks every 15 min". */
    tickRhythm: `checks every ${TICK_INTERVAL_MINUTES} min`,
  },
  fr: {
    disabledNextRun: "désactivée",
    tickRhythm: `vérification toutes les ${TICK_INTERVAL_MINUTES} min`,
  },
});

const FIRST_OF_MONTH = 1;
/** English ordinals by plural category: 1st, 2nd, 3rd, 4th… 11th… 21st. */
const ENGLISH_ORDINALS = new Intl.PluralRules("en-US", { type: "ordinal" });
const ORDINAL_SUFFIXES: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> = {
  one: "st",
  two: "nd",
  few: "rd",
};
const DEFAULT_ORDINAL_SUFFIX = "th";

const RECURRENCE_WORDS = localized({
  en: {
    daily: (time: string) => `every day at ${time}`,
    weekly: (day: string, time: string) => `every ${day} at ${time}`,
    monthly: (day: string, time: string) => `monthly on ${day} at ${time}`,
    dayOfMonth: (day: number) => `the ${englishOrdinal(day)}`,
    lastDayOfMonth: "the last day",
    cron: (expression: string) => `cron: ${expression}`,
  },
  fr: {
    daily: (time) => `chaque jour à ${time}`,
    weekly: (day, time) => `chaque ${day} à ${time}`,
    monthly: (day, time) => `${day} à ${time}`,
    dayOfMonth: (day) => `le ${day === FIRST_OF_MONTH ? "1er" : day} de chaque mois`,
    lastDayOfMonth: "le dernier jour du mois",
    cron: (expression) => `cron : ${expression}`,
  },
});

const RUN_STATUS_WORDS = localized({
  en: {
    updated: (count: number) => `${count} updated`,
    upToDate: "up to date",
    skipped: "skipped",
    missed: "missed",
  },
  fr: {
    updated: (count) => `${count} mis à jour`,
    upToDate: "à jour",
    skipped: "ignorée",
    missed: "manquée",
  },
});

const TARGET_RESULT_WORDS = localized({
  en: {
    noUpdate: "no update",
    failed: (message: string) => `failed — ${message}`,
    unknownError: "unknown error",
    skipped: (reason: string) => `skipped — ${reason}`,
    noReason: "no reason given",
  },
  fr: {
    noUpdate: "aucune mise à jour",
    failed: (message) => `échec — ${message}`,
    unknownError: "erreur inconnue",
    skipped: (reason) => `ignorée — ${reason}`,
    noReason: "sans raison",
  },
});

const TRIGGER_WORDS = localized({
  en: {
    active: (mechanism: string, lastTick: string) =>
      `Trigger: active · ${mechanism} · ${lastTick}`,
    notInstalled: (repair: string) => `Trigger: not installed — ${repair} to install it`,
    disabledByUser: (repair: string) =>
      "Trigger disabled in System Settings › General › Login Items — " +
      `turn it back on or ${repair}`,
    stale: (silence: string, repair: string) => `No check for ${silence} — ${repair} to repair`,
    outdated: (repair: string) => `Trigger: outdated gup path — ${repair} to repair`,
    foreign: (entry: string, repair: string) =>
      `trigger registered for another gup installation: ${entry} — ${repair} to use this one`,
    lastTick: (when: string) => `last check ${when}`,
    noTickYet: "no check yet",
  },
  fr: {
    active: (mechanism, lastTick) => `Déclencheur : actif · ${mechanism} · ${lastTick}`,
    notInstalled: (repair) => `Déclencheur : non installé — ${repair} pour l'installer`,
    disabledByUser: (repair) =>
      "Déclencheur désactivé dans Réglages Système › Général › Ouverture — " +
      `réactivez-le ou ${repair}`,
    stale: (silence, repair) => `Aucun passage depuis ${silence} — ${repair} pour réparer`,
    outdated: (repair) => `Déclencheur : chemin de gup obsolète — ${repair} pour réparer`,
    foreign: (entry, repair) =>
      `planification enregistrée pour une autre installation de gup : ${entry} — ` +
      `${repair} pour utiliser celle-ci`,
    lastTick: (when) => `dernier passage ${when}`,
    noTickYet: "aucun passage encore",
  },
});

/** `{ hour: 9, minute: 5 }` → "09:05". */
export function timeLabel(at: TimeOfDay): string {
  return `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`;
}

/** "every Monday at 09:00", "monthly on the last day at 09:00", "cron: <expression>". */
export function recurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case "daily":
      return RECURRENCE_WORDS.daily(timeLabel(recurrence.at));
    case "weekly":
      return RECURRENCE_WORDS.weekly(WEEKDAY_NAMES[recurrence.weekday], timeLabel(recurrence.at));
    case "monthly":
      return RECURRENCE_WORDS.monthly(monthDayLabel(recurrence.day), timeLabel(recurrence.at));
    case "cron":
      return RECURRENCE_WORDS.cron(recurrence.expression.trim());
  }
}

function monthDayLabel(day: number | "last"): string {
  return day === "last" ? RECURRENCE_WORDS.lastDayOfMonth : RECURRENCE_WORDS.dayOfMonth(day);
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
function englishOrdinal(day: number): string {
  const suffix = ORDINAL_SUFFIXES[ENGLISH_ORDINALS.select(day)] ?? DEFAULT_ORDINAL_SUFFIX;
  return `${day}${suffix}`;
}

/** The last run in a few characters: "√ 2 updated", "± 1/3 — 2 failed", "—". */
export function runStatusLabel(record: ScheduleRunRecord | undefined): string {
  if (!record) return NEVER_RAN;
  const count = (status: TargetResult["status"]): number =>
    record.targets.filter((result) => result.status === status).length;
  const { success, failed, skipped } = STATUS_GLYPHS;
  switch (record.status) {
    case "success":
      return `${success} ${RUN_STATUS_WORDS.updated(count("updated"))}`;
    case "up-to-date":
      return `${success} ${RUN_STATUS_WORDS.upToDate}`;
    case "partial": {
      const problems = { failed: count("failed"), skipped: count("skipped") };
      return partialLabel(count("updated"), problems);
    }
    case "failed":
      return `${failed} ${RUN_SUMMARY.failed(count("failed"))}`;
    case "skipped":
      return `${skipped} ${RUN_STATUS_WORDS.skipped}`;
    case "missed":
      return `– ${RUN_STATUS_WORDS.missed}`;
  }
}

function partialLabel(updated: number, problems: { failed: number; skipped: number }): string {
  const total = updated + problems.failed + problems.skipped;
  const detail =
    problems.failed > 0
      ? RUN_SUMMARY.failed(problems.failed)
      : RUN_SUMMARY.skipped(problems.skipped);
  return `${STATUS_GLYPHS.partial} ${updated}/${total} — ${detail}`;
}

/** One target of a run: "2.46.0 → 2.47.0", "no update", "failed — 1603". */
export function targetResultLabel(result: TargetResult): string {
  switch (result.status) {
    case "updated":
      return `${result.from ?? "?"} → ${result.to ?? "?"}`;
    case "no-update":
      return TARGET_RESULT_WORDS.noUpdate;
    case "failed":
      return TARGET_RESULT_WORDS.failed(result.message ?? TARGET_RESULT_WORDS.unknownError);
    case "skipped":
      return TARGET_RESULT_WORDS.skipped(result.message ?? TARGET_RESULT_WORDS.noReason);
  }
}

export interface TriggerLineContext {
  readonly mechanism: Mechanism;
  readonly now: Date;
  /** How to repair, where the line is shown: "gup schedule install", "i". */
  readonly repair: string;
}

/** The trigger's state in one line; empty when there is nothing to say (no schedule). */
export function triggerLine(health: TriggerHealth, context: TriggerLineContext): string {
  const { repair } = context;
  switch (health.kind) {
    case "none":
      return "";
    case "active": {
      const lastTick = lastTickLabel(health.lastTickAt, context.now);
      return TRIGGER_WORDS.active(MECHANISM_LABELS[context.mechanism], lastTick);
    }
    case "not-installed":
      return TRIGGER_WORDS.notInstalled(repair);
    case "disabled-by-user":
      return TRIGGER_WORDS.disabledByUser(repair);
    case "stale": {
      const silence = formatDuration(context.now.getTime() - health.since.getTime());
      return `${WARNING_MARK} ${TRIGGER_WORDS.stale(silence, repair)}`;
    }
    case "outdated":
      return TRIGGER_WORDS.outdated(repair);
    case "foreign":
      return foreignInstallation(health.entry, repair);
  }
}

/** S-3: the trigger belongs to another gup installation that still exists. */
export function foreignInstallation(entry: string, repair: string): string {
  return TRIGGER_WORDS.foreign(entry, repair);
}

function lastTickLabel(lastTickAt: Date | null, now: Date): string {
  if (!lastTickAt) return TRIGGER_WORDS.noTickYet;
  return TRIGGER_WORDS.lastTick(formatRelative(lastTickAt, now));
}
