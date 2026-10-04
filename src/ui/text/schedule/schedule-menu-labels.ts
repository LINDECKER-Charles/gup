import type { Recurrence, RunKind } from "../../../core/scheduler/model/types.js";
import { TICK_INTERVAL_MINUTES } from "../../../core/scheduler/scheduler-timing.js";
import type { Mechanism } from "../../../core/scheduler/trigger/os-trigger.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { WARNING_MARK } from "./schedule-labels.js";

/**
 * The menu's Planification words (French, the language of the interface):
 * the view, the editor, the dialogs, the notices and the `p` action of
 * Paquets. The vocabulary shared with `gup schedule` — recurrences, run
 * results, the OS trigger — lives in `schedule-labels.ts`.
 */

export const SCHEDULES_LABEL = "Planification";

/** The key that repairs or installs the OS trigger, in the view's lines. */
export const REPAIR_KEY = "i";

/**
 * Most needed first: the bar cuts from the end, and at 80 columns only the
 * first three fit beside `tab menu · q quitter`. The trigger line names `i`
 * whenever the trigger needs a repair, and the arrows move alike in every
 * view: both come last.
 */
export const SCHEDULES_HINTS = {
  /** Espace switches the schedule under the cursor: the hint says which way. */
  list: (isEnabled: boolean) =>
    `entrée modifier · x exécuter · suppr supprimer · ` +
    `espace ${isEnabled ? "désactiver" : "activer"} · ${REPAIR_KEY} déclencheur · ↑↓ naviguer`,
  editor:
    "Ctrl+S enregistrer · entrée modifier · échap annuler · espace basculer · suppr retirer · " +
    "↑↓ champ",
  typing: "tapez · entrée valider · échap annuler",
} as const;

export const EMPTY_SCHEDULES = [
  "Aucune planification.",
  "Dans « Paquets », cochez des paquets puis appuyez sur p.",
] as const;

export const TRIGGER_CHECKING = "Déclencheur : vérification…";

export const LIST_HEADERS = {
  name: "Nom",
  recurrence: "Fréquence",
  targets: "Paquets",
  next: "Prochaine",
  last: "Dernière",
} as const;

const RUN_KIND_LABELS: Readonly<Record<RunKind, string>> = {
  "on-time": "à l'heure",
  "catch-up": "rattrapage",
  manual: "manuelle",
};

/** "Dernière exécution · Outils dev · hier 09:03 · 2 min 14 s · à l'heure". */
export function lastRunHeading(name: string, run: { when: string; took: string; kind: RunKind }) {
  return `Dernière exécution · ${name} · ${run.when} · ${run.took} · ${RUN_KIND_LABELS[run.kind]}`;
}

/** "Prochaine : lun. 5 oct. 09:00 · cron 0 9 * * 1". */
export function nextRunDetail(next: string, cron: string): string {
  return `Prochaine : ${next} · cron ${cron}`;
}

export const NEVER_RAN_DETAIL = "Jamais exécutée.";
/** A target the run found already up to date. */
export const NO_UPDATE_MARK = "=";

/** `p` in Paquets. */
export const SCHEDULE_ACTION = {
  key: "p",
  hint: "p planifier",
  emptyNotice:
    "Cochez les paquets à planifier : une planification cible des paquets, pas un provider.",
} as const;

export const SCHEDULE_PACKAGES = {
  title: (count: number) => `Planifier ${count} paquet(s)`,
  create: "Nouvelle planification…",
  addTo: (name: string, recurrence: string) => `Ajouter à « ${name} » (${recurrence})`,
  close: "Fermer",
  nothing: "Aucun de ces paquets ne peut être planifié :",
  wholeProvider: (label: string) =>
    `« ${label} » représente tout le provider : non planifiable`,
  refused: (label: string, reason: string) => `« ${label} » : ${reason}`,
  added: (count: number, name: string) => `${count} paquet(s) ajouté(s) à « ${name} »`,
  alreadyThere: (name: string) => `Ces paquets sont déjà dans « ${name} ».`,
} as const;

export const EDITOR_TITLES = {
  create: "Nouvelle planification",
  edit: (name: string) => `Modifier « ${name} »`,
} as const;

export const FIELD_LABELS = {
  name: "Nom",
  frequency: "Fréquence",
  day: "Jour",
  time: "Heure",
  cron: "Expression cron",
  catchUp: "Rattrapage",
} as const;

export const FREQUENCY_LABELS: Readonly<Record<Recurrence["kind"], string>> = {
  daily: "Chaque jour",
  weekly: "Chaque semaine",
  monthly: "Chaque mois",
  cron: "Personnalisée (cron)",
};

export const CATCH_UP_VALUES = {
  on: "oui",
  off: "non",
  help: "relance à la prochaine occasion si l'heure est manquée",
} as const;

export const LAST_MONTH_DAY = "dernier jour du mois";

export const EDITOR_TEXT = {
  targets: (count: number) => `Paquets (${count})`,
  addTarget: "+ Ajouter un paquet…",
  save: "[ Enregistrer ]",
  cancel: "[ Annuler ]",
  adminNote: "droits administrateur requis : sera ignoré",
  preview: (cron: string, runs: readonly string[]) =>
    `cron ${cron} · prochaines : ${runs.length > 0 ? runs.join(" · ") : "aucune"}`,
  fixFirst: "Corrigez les champs signalés avant d'enregistrer.",
} as const;

export const FREQUENCY_DIALOG = { title: FIELD_LABELS.frequency } as const;
export const WEEKDAY_DIALOG = { title: "Jour de la semaine" } as const;

export const MONTH_DAY_DIALOG = {
  title: "Jour du mois",
  text: "1 à 28, ou « dernier » pour le dernier jour du mois.",
  invalid: "1 à 28, ou dernier",
  /** What to type for the last day. */
  last: "dernier",
} as const;

export const ADD_TARGET_DIALOG = {
  title: "Ajouter un paquet",
  text:
    "provider:paquet, avec l'identifiant que « gup list » affiche — par exemple " +
    "winget:Git.Git.",
} as const;

export const LEAVE_DIALOG = {
  title: "Abandonner les modifications ?",
  text: "Les changements de cette planification seront perdus.",
} as const;

/** Leaving the editor of a schedule never saved, changed or not. */
export const LEAVE_NEW_DIALOG = {
  title: "Abandonner la nouvelle planification ?",
  text: "Elle n'a pas encore été enregistrée.",
} as const;

export const REMOVE_DIALOG = {
  title: (name: string) => `Supprimer « ${name} » ?`,
  text: "Cette planification ne sera plus exécutée.",
} as const;

export const RUN_NOW_DIALOG = {
  title: (name: string) => `Exécuter « ${name} » maintenant ?`,
  text: (providers: readonly string[], count: number) =>
    `Scanne ${providers.join(", ")} puis met à jour les paquets obsolètes parmi ${count}.`,
} as const;

const RUNS_EVERY_TICK =
  `gup est lancé toutes les ${TICK_INTERVAL_MINUTES} minutes : il vérifie si une ` +
  "planification est due, fait le travail puis s'arrête. Aucun processus ne reste en " +
  "mémoire. Tout se retire avec « gup schedule uninstall ».";

const CONSENT_FIRST_LINES: Readonly<Record<Mechanism, string>> = {
  "windows-task":
    "gup va enregistrer une tâche dans le Planificateur de tâches Windows, pour votre " +
    "session uniquement et sans droits administrateur.",
  launchd:
    "gup va enregistrer un agent launchd (agent utilisateur macOS), pour votre session " +
    "uniquement et sans droits administrateur. macOS l'annoncera comme élément en " +
    "arrière-plan.",
  crontab:
    "gup va ajouter une ligne à la crontab de votre utilisateur, sans droits administrateur.",
};

/** Asked once, before the first registration of the OS trigger. */
export const CONSENT_DIALOG = {
  title: "Activer la planification",
  text: (mechanism: Mechanism): readonly string[] => [
    CONSENT_FIRST_LINES[mechanism],
    "",
    RUNS_EVERY_TICK,
  ],
} as const;

export const SCHEDULE_NOTICES = {
  created: (name: string, recurrence: string) =>
    `${STATUS_GLYPHS.success} Planification « ${name} » créée — ${recurrence}`,
  saved: (name: string) => `${STATUS_GLYPHS.success} Planification « ${name} » enregistrée`,
  removed: (name: string) => `Planification « ${name} » supprimée`,
  enabled: (name: string, next: string) =>
    `Planification « ${name} » activée — prochaine exécution ${next}`,
  disabled: (name: string) => `Planification « ${name} » désactivée`,
  scanning: (providers: readonly string[]) => `Scan de ${providers.join(", ")}…`,
  ran: (status: string) => `Exécution terminée : ${status}`,
  busy: "Une exécution de planification est déjà en cours.",
  scanRunning: "Scan en cours — l'exécution sera possible à la fin du scan.",
  notSaved: (message: string) =>
    `${STATUS_GLYPHS.failed} Planifications non enregistrées : ${message}`,
  vanished: "Cette planification n'existe plus (supprimée depuis un autre terminal).",
  triggerFailed: (reason: string) =>
    `${WARNING_MARK} Le déclencheur système n'a pas pu être modifié : ${reason} — ` +
    `${REPAIR_KEY} pour réessayer`,
  unsupported: (reason: string) => `Déclencheur : ${reason}`,
  /** "Non" to the consent: whatever was asked for stays as it was. */
  consentRefused:
    `${WARNING_MARK} Rien n'a été modifié : une planification active a besoin du ` +
    "déclencheur système.",
} as const;

/** The sidebar badge when a run the user has not looked at failed. */
export const UNSEEN_FAILURE_BADGE = "!";

/** Title-bar fact while runs are unseen: "planif. : 2 exécution(s) · 1 échec". */
export function unseenRunsFact(runs: number, failures: number): string {
  const failed = failures > 0 ? ` · ${failures} échec${failures > 1 ? "s" : ""}` : "";
  return `planif. : ${runs} exécution(s)${failed}`;
}
