import type { Schedule } from "../../core/scheduler/model/types.js";
import type { Mechanism } from "../../core/scheduler/trigger/os-trigger.js";
import { STATUS_GLYPHS } from "../theme/glyphs.js";
import {
  MECHANISM_LABELS,
  recurrenceLabel,
  TICK_RHYTHM,
  WARNING_MARK,
} from "./schedule-labels.js";

/**
 * What `gup schedule …` prints (French, the language of the interface).
 * The vocabulary shared with the menu lives in `schedule-labels.ts`.
 */

export const REPAIR_COMMAND = "gup schedule install";
/** The scheduler's line in `gup doctor`'s "Système" section. */
export const DIAGNOSTIC_LABEL = "Planification";
export const NO_ACTIVE_SCHEDULE = "aucune planification active";
export const UNINSTALL_COMMAND = "gup schedule uninstall";
export const ENABLE_HINT = "« gup schedule enable <id> » pour réactiver";

export function scheduleRef(schedule: Pick<Schedule, "id" | "name">): string {
  return `${schedule.id} « ${schedule.name} »`;
}

export function createdLine(schedule: Schedule): string {
  const state = schedule.enabled ? "" : " (désactivée)";
  const when = recurrenceLabel(schedule.recurrence);
  return `${STATUS_GLYPHS.success} Planification ${scheduleRef(schedule)} créée — ${when}${state}`;
}

export function disabledPreview(schedule: Pick<Schedule, "id">): string {
  return `désactivée — « gup schedule enable ${schedule.id} » pour l'activer`;
}

export function nextRunsLine(labels: readonly string[]): string {
  return labels.length === 0
    ? "aucune exécution prévue"
    : `prochaines exécutions : ${labels.join(" · ")}`;
}

export function triggerInstalledLine(mechanism: Mechanism): string {
  return `déclencheur système installé (${MECHANISM_LABELS[mechanism]} · ${TICK_RHYTHM})`;
}

export const TRIGGER_REMOVED = "déclencheur système retiré (plus aucune planification active)";

/** The trigger could not be changed; schedules themselves are saved. */
export function triggerFailedLines(reason: string, retry = REPAIR_COMMAND): readonly string[] {
  return [
    `${WARNING_MARK} Le déclencheur système n'a pas pu être modifié : ${reason}`,
    `  Réessayez : ${retry}`,
  ];
}

export const SCHEDULER_DIR_OVERRIDDEN =
  `${WARNING_MARK} GUP_SCHEDULER_DIR est défini dans cette session : le déclencheur ` +
  "système ne le verra pas et lira l'emplacement par défaut";

export const WINGET_UAC_NOTE =
  "note : un paquet winget installé pour tous les utilisateurs peut demander l'UAC — " +
  "il sera alors ignoré (jamais d'élévation sans surveillance)";

export function removedLine(schedule: Schedule): string {
  return `Planification supprimée : ${scheduleRef(schedule)}`;
}

export function enabledLine(schedule: Schedule, nextRun: string): string {
  return `Planification activée : ${scheduleRef(schedule)} — prochaine exécution ${nextRun}`;
}

export function disabledLine(schedule: Schedule): string {
  return `Planification désactivée : ${scheduleRef(schedule)}`;
}

export const NO_ACTIVE_TRIGGER = "Aucune planification active : aucun déclencheur système.";

export const NO_SCHEDULE =
  "Aucune planification. Créez-en une : gup schedule add winget:Git.Git --every daily";

export const NOTHING_TO_INSTALL =
  "Aucune planification active : le déclencheur n'existe qu'avec au moins une " +
  "planification active.";

export function uninstalledLine(disabledCount: number): string {
  if (disabledCount === 0) return "Déclencheur supprimé.";
  return `Déclencheur supprimé. ${disabledCount} planification(s) désactivée(s) — ${ENABLE_HINT}.`;
}

export const PURGED = "Déclencheur supprimé. Planifications et état des exécutions effacés.";

export const TRIGGER_REPAIRED = "Déclencheur système réparé (chemin de gup mis à jour).";

export function runNowHeader(schedule: Schedule, providers: readonly string[]): string {
  const scan = providers.length > 0 ? ` — scan : ${providers.join(", ")}…` : "";
  return `Exécution de ${scheduleRef(schedule)}${scan}`;
}

export const TABLE_HEADERS = {
  id: "ID",
  state: "ÉTAT",
  name: "NOM",
  recurrence: "FRÉQUENCE",
  targets: "PAQUETS",
  next: "PROCHAINE",
  last: "DERNIÈRE",
} as const;
