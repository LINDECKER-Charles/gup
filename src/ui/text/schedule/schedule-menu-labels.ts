import { localized } from "../../../core/i18n/localized.js";
import type { RunKind } from "../../../core/scheduler/model/types.js";
import { TICK_INTERVAL_MINUTES } from "../../../core/scheduler/scheduler-timing.js";
import type { Mechanism } from "../../../core/scheduler/trigger/os-trigger.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { counted } from "../format.js";
import { WARNING_MARK } from "./schedule-labels.js";

/**
 * The menu's Schedules view, in the interface's languages: the list, its
 * dialogs and notices, and the `p` action of Packages. The editor's words
 * live in `schedule-editor-labels.ts`; the vocabulary shared with
 * `gup schedule` — recurrences, run results, the OS trigger — in
 * `schedule-labels.ts`.
 */

/** The key that repairs or installs the OS trigger, in the view's lines. */
export const REPAIR_KEY = "i";
/** The key of the `p` action in Packages. */
const SCHEDULE_KEY = "p";

export const SCHEDULE_MENU_LABELS = localized({
  en: {
    /** The sidebar's label and the list's title. */
    schedulesLabel: "Schedules",
    /** What the view says while there is no schedule: where schedules come from. */
    emptySchedules: [
      "No schedules.",
      'In "Packages", check some packages then press p.',
    ] as readonly [string, string],
    triggerChecking: "Trigger: checking…",
    neverRanDetail: "Never run.",
  },
  fr: {
    schedulesLabel: "Planification",
    emptySchedules: [
      "Aucune planification.",
      "Dans « Paquets », cochez des paquets puis appuyez sur p.",
    ],
    triggerChecking: "Déclencheur : vérification…",
    neverRanDetail: "Jamais exécutée.",
  },
});

/**
 * Most needed first: the bar cuts from the end, and at 80 columns only the
 * first three fit beside the menu's own keys. The trigger line names `i`
 * whenever the trigger needs a repair, and the arrows move alike in every
 * view: both come last.
 */
export const SCHEDULES_HINTS = localized({
  en: {
    /** Space switches the schedule under the cursor: the hint says which way. */
    list: (isEnabled: boolean) =>
      `enter edit · x run · del delete · space ${isEnabled ? "disable" : "enable"} · ` +
      `${REPAIR_KEY} trigger · ↑↓ navigate`,
    editor: "Ctrl+S save · enter edit · esc cancel · space toggle · del remove · ↑↓ field",
    typing: "type · enter confirm · esc cancel",
  },
  fr: {
    list: (isEnabled) =>
      `entrée modifier · x exécuter · suppr supprimer · ` +
      `espace ${isEnabled ? "désactiver" : "activer"} · ${REPAIR_KEY} déclencheur · ↑↓ naviguer`,
    editor:
      "Ctrl+S enregistrer · entrée modifier · échap annuler · espace basculer · suppr retirer · " +
      "↑↓ champ",
    typing: "tapez · entrée valider · échap annuler",
  },
});

export const LIST_HEADERS = localized({
  en: { name: "Name", recurrence: "Frequency", targets: "Packages", next: "Next", last: "Last" },
  fr: {
    name: "Nom",
    recurrence: "Fréquence",
    targets: "Paquets",
    next: "Prochaine",
    last: "Dernière",
  },
});

/** The words of the details under the list. */
const DETAIL_WORDS = localized({
  en: {
    lastRun: "Last run",
    runKinds: {
      "on-time": "on time",
      "catch-up": "catch-up",
      manual: "manual",
    } as Readonly<Record<RunKind, string>>,
    nextRun: (next: string, cron: string) => `Next: ${next} · cron ${cron}`,
  },
  fr: {
    lastRun: "Dernière exécution",
    runKinds: { "on-time": "à l'heure", "catch-up": "rattrapage", manual: "manuelle" },
    nextRun: (next, cron) => `Prochaine : ${next} · cron ${cron}`,
  },
});

/** "Last run · Dev tools · yesterday 09:03 · 2 min 14 s · on time". */
export function lastRunHeading(name: string, run: { when: string; took: string; kind: RunKind }) {
  const kind = DETAIL_WORDS.runKinds[run.kind];
  return [DETAIL_WORDS.lastRun, name, run.when, run.took, kind].join(" · ");
}

/** "Next: Mon, Oct 5 09:00 · cron 0 9 * * 1". */
export function nextRunDetail(next: string, cron: string): string {
  return DETAIL_WORDS.nextRun(next, cron);
}

/** A target the run found already up to date. */
export const NO_UPDATE_MARK = "=";

/** `p` in Packages. */
export const SCHEDULE_ACTION = localized({
  en: {
    key: SCHEDULE_KEY,
    hint: `${SCHEDULE_KEY} schedule`,
    emptyNotice: "Check the packages to schedule: a schedule targets packages, not a provider.",
  },
  fr: {
    key: SCHEDULE_KEY,
    hint: `${SCHEDULE_KEY} planifier`,
    emptyNotice:
      "Cochez les paquets à planifier : une planification cible des paquets, pas un provider.",
  },
});

export const SCHEDULE_PACKAGES = localized({
  en: {
    title: (count: number) => `Schedule ${counted(count, "package", "packages")}`,
    create: "New schedule…",
    addTo: (name: string, recurrence: string) => `Add to "${name}" (${recurrence})`,
    close: "Close",
    nothing: "None of these packages can be scheduled:",
    wholeProvider: (label: string) =>
      `"${label}" stands for the whole provider: cannot be scheduled`,
    refused: (label: string, reason: string) => `"${label}": ${reason}`,
    added: (count: number, name: string) =>
      `${counted(count, "package", "packages")} added to "${name}"`,
    alreadyThere: (name: string) => `These packages are already in "${name}".`,
  },
  fr: {
    title: (count) => `Planifier ${count} paquet(s)`,
    create: "Nouvelle planification…",
    addTo: (name, recurrence) => `Ajouter à « ${name} » (${recurrence})`,
    close: "Fermer",
    nothing: "Aucun de ces paquets ne peut être planifié :",
    wholeProvider: (label) => `« ${label} » représente tout le provider : non planifiable`,
    refused: (label, reason) => `« ${label} » : ${reason}`,
    added: (count, name) => `${count} paquet(s) ajouté(s) à « ${name} »`,
    alreadyThere: (name) => `Ces paquets sont déjà dans « ${name} ».`,
  },
});

export const REMOVE_DIALOG = localized({
  en: {
    title: (name: string) => `Delete "${name}"?`,
    text: "This schedule will no longer run.",
  },
  fr: {
    title: (name) => `Supprimer « ${name} » ?`,
    text: "Cette planification ne sera plus exécutée.",
  },
});

export const RUN_NOW_DIALOG = localized({
  en: {
    title: (name: string) => `Run "${name}" now?`,
    text: (providers: readonly string[], count: number) =>
      `Scans ${providers.join(", ")}, then updates ` +
      (count === 1
        ? "its package if it is outdated."
        : `whichever of its ${count} packages are outdated.`),
  },
  fr: {
    title: (name) => `Exécuter « ${name} » maintenant ?`,
    text: (providers, count) =>
      `Scanne ${providers.join(", ")} puis met à jour les paquets obsolètes parmi ${count}.`,
  },
});

const CONSENT_WORDS = localized({
  en: {
    title: "Turn on scheduling",
    /** What gup registers, by mechanism. */
    firstLines: {
      "windows-task":
        "gup will register a task in Windows Task Scheduler, for your session only and " +
        "without administrator rights.",
      launchd:
        "gup will register a launchd agent (macOS user agent), for your session only and " +
        "without administrator rights. macOS will announce it as a background item.",
      crontab: "gup will add a line to your user's crontab, without administrator rights.",
    } as Readonly<Record<Mechanism, string>>,
    runsEveryTick:
      `gup is started every ${TICK_INTERVAL_MINUTES} minutes: it checks whether a schedule ` +
      "is due, does the work, then exits. No process stays in memory. Everything is " +
      'removed with "gup schedule uninstall".',
  },
  fr: {
    title: "Activer la planification",
    firstLines: {
      "windows-task":
        "gup va enregistrer une tâche dans le Planificateur de tâches Windows, pour votre " +
        "session uniquement et sans droits administrateur.",
      launchd:
        "gup va enregistrer un agent launchd (agent utilisateur macOS), pour votre session " +
        "uniquement et sans droits administrateur. macOS l'annoncera comme élément en " +
        "arrière-plan.",
      crontab:
        "gup va ajouter une ligne à la crontab de votre utilisateur, sans droits administrateur.",
    },
    runsEveryTick:
      `gup est lancé toutes les ${TICK_INTERVAL_MINUTES} minutes : il vérifie si une ` +
      "planification est due, fait le travail puis s'arrête. Aucun processus ne reste en " +
      "mémoire. Tout se retire avec « gup schedule uninstall ».",
  },
});

/** Asked once, before the first registration of the OS trigger. */
export const CONSENT_DIALOG = {
  get title(): string {
    return CONSENT_WORDS.title;
  },
  text: (mechanism: Mechanism): readonly string[] => [
    CONSENT_WORDS.firstLines[mechanism],
    "",
    CONSENT_WORDS.runsEveryTick,
  ],
};

export const SCHEDULE_NOTICES = localized({
  en: {
    created: (name: string, recurrence: string) =>
      `${STATUS_GLYPHS.success} Schedule "${name}" created — ${recurrence}`,
    saved: (name: string) => `${STATUS_GLYPHS.success} Schedule "${name}" saved`,
    removed: (name: string) => `Schedule "${name}" deleted`,
    enabled: (name: string, next: string) => `Schedule "${name}" enabled — next run ${next}`,
    disabled: (name: string) => `Schedule "${name}" disabled`,
    scanning: (providers: readonly string[]) => `Scanning ${providers.join(", ")}…`,
    ran: (status: string) => `Run finished: ${status}`,
    busy: "A schedule run is already in progress.",
    scanRunning: "Scan in progress — the schedule can run once the scan ends.",
    notSaved: (message: string) => `${STATUS_GLYPHS.failed} Schedules not saved: ${message}`,
    vanished: "This schedule no longer exists (deleted from another terminal).",
    triggerFailed: (reason: string) =>
      `${WARNING_MARK} The OS trigger could not be changed: ${reason} — ` +
      `${REPAIR_KEY} to retry`,
    unsupported: (reason: string) => `Trigger: ${reason}`,
    /** "No" to the consent: whatever was asked for stays as it was. */
    consentRefused:
      `${WARNING_MARK} Nothing was changed: an active schedule needs the OS trigger.`,
  },
  fr: {
    created: (name, recurrence) =>
      `${STATUS_GLYPHS.success} Planification « ${name} » créée — ${recurrence}`,
    saved: (name) => `${STATUS_GLYPHS.success} Planification « ${name} » enregistrée`,
    removed: (name) => `Planification « ${name} » supprimée`,
    enabled: (name, next) => `Planification « ${name} » activée — prochaine exécution ${next}`,
    disabled: (name) => `Planification « ${name} » désactivée`,
    scanning: (providers) => `Scan de ${providers.join(", ")}…`,
    ran: (status) => `Exécution terminée : ${status}`,
    busy: "Une exécution de planification est déjà en cours.",
    scanRunning: "Scan en cours — l'exécution sera possible à la fin du scan.",
    notSaved: (message) => `${STATUS_GLYPHS.failed} Planifications non enregistrées : ${message}`,
    vanished: "Cette planification n'existe plus (supprimée depuis un autre terminal).",
    triggerFailed: (reason) =>
      `${WARNING_MARK} Le déclencheur système n'a pas pu être modifié : ${reason} — ` +
      `${REPAIR_KEY} pour réessayer`,
    unsupported: (reason) => `Déclencheur : ${reason}`,
    consentRefused:
      `${WARNING_MARK} Rien n'a été modifié : une planification active a besoin du ` +
      "déclencheur système.",
  },
});

/** The sidebar badge when a run the user has not looked at failed. */
export const UNSEEN_FAILURE_BADGE = "!";

const UNSEEN_RUNS = localized({
  en: {
    runs: (count: number) => `schedules: ${counted(count, "run", "runs")}`,
    failures: (count: number) => `${count} failed`,
  },
  fr: {
    runs: (count) => `planif. : ${count} exécution(s)`,
    failures: (count) => `${count} échec${count > 1 ? "s" : ""}`,
  },
});

/** Title-bar fact while runs are unseen: "schedules: 2 runs · 1 failed". */
export function unseenRunsFact(runs: number, failures: number): string {
  const failed = failures > 0 ? ` · ${UNSEEN_RUNS.failures(failures)}` : "";
  return `${UNSEEN_RUNS.runs(runs)}${failed}`;
}
