import type {
  Recurrence,
  ScheduleRunRecord,
  TargetResult,
  TimeOfDay,
} from "../../../core/scheduler/model/types.js";
import { TICK_INTERVAL_MINUTES } from "../../../core/scheduler/scheduler-timing.js";
import type { Mechanism } from "../../../core/scheduler/trigger/os-trigger.js";
import type { TriggerHealth } from "../../../core/scheduler/trigger/trigger-health.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { formatDuration, formatRelative } from "../fr-format.js";
import { RUN_SUMMARY } from "../run-labels.js";

/**
 * The scheduler's words (French, the language of the interface), shared by
 * `gup schedule` and the menu's Planification view: recurrences, run
 * results, the OS trigger. Pure; "now" is always passed in.
 */

export const WEEKDAY_NAMES = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

export const MECHANISM_LABELS: Readonly<Record<Mechanism, string>> = {
  "windows-task": "Planificateur de tâches Windows",
  launchd: "launchd (agent utilisateur macOS)",
  crontab: "crontab de votre utilisateur",
};

export const NEVER_RAN = "—";
export const WARNING_MARK = STATUS_GLYPHS.warning;
export const DISABLED_NEXT_RUN = "désactivée";
const FIRST_OF_MONTH = 1;

/** `{ hour: 9, minute: 5 }` → "09:05". */
export function timeLabel(at: TimeOfDay): string {
  return `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`;
}

/** "chaque lundi à 09:00", "le dernier jour du mois à 09:00", "cron : <expression>". */
export function recurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case "daily":
      return `chaque jour à ${timeLabel(recurrence.at)}`;
    case "weekly":
      return `chaque ${WEEKDAY_NAMES[recurrence.weekday]} à ${timeLabel(recurrence.at)}`;
    case "monthly":
      return `${monthDayLabel(recurrence.day)} à ${timeLabel(recurrence.at)}`;
    case "cron":
      return `cron : ${recurrence.expression.trim()}`;
  }
}

function monthDayLabel(day: number | "last"): string {
  if (day === "last") return "le dernier jour du mois";
  return `le ${day === FIRST_OF_MONTH ? "1er" : day} de chaque mois`;
}

/** The last run in a few characters: "√ 2 mis à jour", "± 1/3 — 2 échecs", "—". */
export function runStatusLabel(record: ScheduleRunRecord | undefined): string {
  if (!record) return NEVER_RAN;
  const count = (status: TargetResult["status"]): number =>
    record.targets.filter((result) => result.status === status).length;
  const { success, failed, skipped } = STATUS_GLYPHS;
  switch (record.status) {
    case "success":
      return `${success} ${count("updated")} mis à jour`;
    case "up-to-date":
      return `${success} à jour`;
    case "partial": {
      const problems = { failed: count("failed"), skipped: count("skipped") };
      return partialLabel(count("updated"), problems);
    }
    case "failed":
      return `${failed} ${RUN_SUMMARY.failed(count("failed"))}`;
    case "skipped":
      return `${skipped} ignorée`;
    case "missed":
      return "– manquée";
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

/** One target of a run: "2.46.0 → 2.47.0", "aucune mise à jour", "échec — 1603". */
export function targetResultLabel(result: TargetResult): string {
  switch (result.status) {
    case "updated":
      return `${result.from ?? "?"} → ${result.to ?? "?"}`;
    case "no-update":
      return "aucune mise à jour";
    case "failed":
      return `échec — ${result.message ?? "erreur inconnue"}`;
    case "skipped":
      return `ignorée — ${result.message ?? "sans raison"}`;
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
  const mechanism = MECHANISM_LABELS[context.mechanism];
  switch (health.kind) {
    case "none":
      return "";
    case "active": {
      const lastTick = lastTickLabel(health.lastTickAt, context.now);
      return `Déclencheur : actif · ${mechanism} · ${lastTick}`;
    }
    case "not-installed":
      return `Déclencheur : non installé — ${context.repair} pour l'installer`;
    case "disabled-by-user":
      return (
        "Déclencheur désactivé dans Réglages Système › Général › Ouverture — " +
        `réactivez-le ou ${context.repair}`
      );
    case "stale": {
      const silence = formatDuration(context.now.getTime() - health.since.getTime());
      return `${WARNING_MARK} Aucun passage depuis ${silence} — ${context.repair} pour réparer`;
    }
    case "outdated":
      return `Déclencheur : chemin de gup obsolète — ${context.repair} pour réparer`;
    case "foreign":
      return foreignInstallation(health.entry, context.repair);
  }
}

/** S-3: the trigger belongs to another gup installation that still exists. */
export function foreignInstallation(entry: string, repair: string): string {
  return (
    `planification enregistrée pour une autre installation de gup : ${entry} — ` +
    `${repair} pour utiliser celle-ci`
  );
}

function lastTickLabel(lastTickAt: Date | null, now: Date): string {
  if (!lastTickAt) return "aucun passage encore";
  return `dernier passage ${formatRelative(lastTickAt, now)}`;
}

/** "vérification toutes les 15 min". */
export const TICK_RHYTHM = `vérification toutes les ${TICK_INTERVAL_MINUTES} min`;
