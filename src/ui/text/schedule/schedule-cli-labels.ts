import { localized } from "../../../core/i18n/localized.js";
import { TARGET_MESSAGES } from "../../../core/scheduler/model/schedule-target.js";
import type { Schedule } from "../../../core/scheduler/model/types.js";
import type { Launcher, Mechanism } from "../../../core/scheduler/trigger/os-trigger.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { counted } from "../format.js";
import {
  MECHANISM_LABELS,
  recurrenceLabel,
  SCHEDULE_LABELS,
  WARNING_MARK,
} from "./schedule-labels.js";

/**
 * What `gup schedule …` prints, in the interface's languages. The
 * vocabulary shared with the menu lives in `schedule-labels.ts`, the
 * commands' help in `schedule-command-labels.ts`. Commands shown to be
 * copied are the same in every language.
 */

export const REPAIR_COMMAND = "gup schedule install";
export const UNINSTALL_COMMAND = "gup schedule uninstall";
const ADD_COMMAND = "gup schedule add winget:Git.Git --every daily";
const ENABLE_COMMAND = "gup schedule enable";

export const SCHEDULE_CLI_LABELS = localized({
  en: {
    /** The scheduler's line in `gup doctor`'s system section. */
    diagnosticLabel: "Schedules",
    noActiveSchedule: "no active schedule",
    /** The doctor line's value: "2 active — Trigger: active · …". */
    diagnosticValue: (count: number, trigger: string) => `${count} active — ${trigger}`,
    triggerRemoved: "OS trigger removed (no active schedule left)",
    schedulerDirOverridden:
      `${WARNING_MARK} GUP_SCHEDULER_DIR is set in this session: the OS trigger will not ` +
      "see it and will read the default location",
    wingetUacNote:
      "note: a winget package installed for all users may ask for UAC — it will then be " +
      "skipped (an unattended run never elevates)",
    noActiveTrigger: "No active schedule: no OS trigger.",
    noSchedule: `No schedules. Create one: ${ADD_COMMAND}`,
    nothingToInstall:
      "No active schedule: the trigger only exists while at least one schedule is active.",
    purged: "Trigger removed. Schedules and run state deleted.",
    triggerRepaired: "OS trigger repaired (gup path updated).",
  },
  fr: {
    diagnosticLabel: "Planification",
    noActiveSchedule: "aucune planification active",
    diagnosticValue: (count, trigger) => `${count} active(s) — ${trigger}`,
    triggerRemoved: "déclencheur système retiré (plus aucune planification active)",
    schedulerDirOverridden:
      `${WARNING_MARK} GUP_SCHEDULER_DIR est défini dans cette session : le déclencheur ` +
      "système ne le verra pas et lira l'emplacement par défaut",
    wingetUacNote:
      "note : un paquet winget installé pour tous les utilisateurs peut demander l'UAC — " +
      "il sera alors ignoré (jamais d'élévation sans surveillance)",
    noActiveTrigger: "Aucune planification active : aucun déclencheur système.",
    noSchedule: `Aucune planification. Créez-en une : ${ADD_COMMAND}`,
    nothingToInstall:
      "Aucune planification active : le déclencheur n'existe qu'avec au moins une " +
      "planification active.",
    purged: "Déclencheur supprimé. Planifications et état des exécutions effacés.",
    triggerRepaired: "Déclencheur système réparé (chemin de gup mis à jour).",
  },
});

/** The words of the lines the functions below build. */
const LINES = localized({
  en: {
    ref: (id: string, name: string) => `${id} "${name}"`,
    created: (ref: string, when: string) => `Schedule ${ref} created — ${when}`,
    createdDisabled: " (disabled)",
    disabledPreview: (id: string) => `disabled — "${ENABLE_COMMAND} ${id}" to enable it`,
    noRunPlanned: "no run planned",
    nextRuns: (runs: string) => `next runs: ${runs}`,
    triggerInstalled: (mechanism: string, rhythm: string) =>
      `OS trigger installed (${mechanism} · ${rhythm})`,
    triggerFailed: (reason: string) => `The OS trigger could not be changed: ${reason}`,
    retry: (command: string) => `Retry: ${command}`,
    removed: (ref: string) => `Schedule removed: ${ref}`,
    enabled: (ref: string, nextRun: string) => `Schedule enabled: ${ref} — next run ${nextRun}`,
    disabled: (ref: string) => `Schedule disabled: ${ref}`,
    uninstalled: "Trigger removed.",
    disabledByUninstall: (count: number) =>
      `${counted(count, "schedule", "schedules")} disabled — ` +
      `"${ENABLE_COMMAND} <id>" to re-enable.`,
    running: (ref: string) => `Running ${ref}`,
    scanning: (providers: string) => ` — scan: ${providers}…`,
    addExample: `  Example: ${ADD_COMMAND}`,
    issue: (subject: string, message: string) => `${subject}: ${message}`,
    notSaved: (reason: string) => `Schedules not saved: ${reason}`,
    unsupportedTrigger: (reason: string) => `Trigger: ${reason}`,
    result: (status: string) => `Result: ${status}`,
  },
  fr: {
    ref: (id, name) => `${id} « ${name} »`,
    created: (ref, when) => `Planification ${ref} créée — ${when}`,
    createdDisabled: " (désactivée)",
    disabledPreview: (id) => `désactivée — « ${ENABLE_COMMAND} ${id} » pour l'activer`,
    noRunPlanned: "aucune exécution prévue",
    nextRuns: (runs) => `prochaines exécutions : ${runs}`,
    triggerInstalled: (mechanism, rhythm) =>
      `déclencheur système installé (${mechanism} · ${rhythm})`,
    triggerFailed: (reason) => `Le déclencheur système n'a pas pu être modifié : ${reason}`,
    retry: (command) => `Réessayez : ${command}`,
    removed: (ref) => `Planification supprimée : ${ref}`,
    enabled: (ref, nextRun) => `Planification activée : ${ref} — prochaine exécution ${nextRun}`,
    disabled: (ref) => `Planification désactivée : ${ref}`,
    uninstalled: "Déclencheur supprimé.",
    disabledByUninstall: (count) =>
      `${count} planification(s) désactivée(s) — « ${ENABLE_COMMAND} <id> » pour réactiver.`,
    running: (ref) => `Exécution de ${ref}`,
    scanning: (providers) => ` — scan : ${providers}…`,
    addExample: `  Exemple : ${ADD_COMMAND}`,
    issue: (subject, message) => `${subject} : ${message}`,
    notSaved: (reason) => `Planifications non enregistrées : ${reason}`,
    unsupportedTrigger: (reason) => `Déclencheur : ${reason}`,
    result: (status) => `Résultat : ${status}`,
  },
});

export function scheduleRef(schedule: Pick<Schedule, "id" | "name">): string {
  return LINES.ref(schedule.id, schedule.name);
}

export function createdLine(schedule: Schedule): string {
  const state = schedule.enabled ? "" : LINES.createdDisabled;
  const when = recurrenceLabel(schedule.recurrence);
  return `${STATUS_GLYPHS.success} ${LINES.created(scheduleRef(schedule), when)}${state}`;
}

export function disabledPreview(schedule: Pick<Schedule, "id">): string {
  return LINES.disabledPreview(schedule.id);
}

export function nextRunsLine(labels: readonly string[]): string {
  return labels.length === 0 ? LINES.noRunPlanned : LINES.nextRuns(labels.join(" · "));
}

export function triggerInstalledLine(mechanism: Mechanism): string {
  return LINES.triggerInstalled(MECHANISM_LABELS[mechanism], SCHEDULE_LABELS.tickRhythm);
}

/** The trigger could not be changed; schedules themselves are saved. */
export function triggerFailedLines(reason: string, retry = REPAIR_COMMAND): readonly string[] {
  return [`${WARNING_MARK} ${LINES.triggerFailed(reason)}`, `  ${LINES.retry(retry)}`];
}

export function removedLine(schedule: Schedule): string {
  return LINES.removed(scheduleRef(schedule));
}

export function enabledLine(schedule: Schedule, nextRun: string): string {
  return LINES.enabled(scheduleRef(schedule), nextRun);
}

export function disabledLine(schedule: Schedule): string {
  return LINES.disabled(scheduleRef(schedule));
}

export function uninstalledLine(disabledCount: number): string {
  if (disabledCount === 0) return LINES.uninstalled;
  return `${LINES.uninstalled} ${LINES.disabledByUninstall(disabledCount)}`;
}

export function runNowHeader(schedule: Schedule, providers: readonly string[]): string {
  const scan = providers.length > 0 ? LINES.scanning(providers.join(", ")) : "";
  return `${LINES.running(scheduleRef(schedule))}${scan}`;
}

export const TABLE_HEADERS = localized({
  en: {
    id: "ID",
    state: "STATE",
    name: "NAME",
    recurrence: "FREQUENCY",
    targets: "PACKAGES",
    next: "NEXT",
    last: "LAST",
  },
  fr: {
    id: "ID",
    state: "ÉTAT",
    name: "NOM",
    recurrence: "FRÉQUENCE",
    targets: "PAQUETS",
    next: "PROCHAINE",
    last: "DERNIÈRE",
  },
});

/** A bare provider was given: the rule, then how to name a package. */
export function notAPackage(): string {
  return `${TARGET_MESSAGES.neverAProvider}\n${LINES.addExample}`;
}

/** Why the arguments of `gup schedule add | install` are not a schedule (exit 2). */
export const ARGUMENT_ERRORS = localized({
  en: {
    noTarget: "at least one package required (provider:package)",
    launcher: (value: string): string =>
      `--launcher: headless or direct expected (got "${value}")`,
    bothFrequencies: "--every and --cron are mutually exclusive: choose one",
    noFrequency:
      'frequency required: --every <daily|weekly|monthly> or --cron "<m h dom mon dow>"',
    every: (value: string): string =>
      `--every: daily, weekly or monthly expected (got "${value}")`,
    at: (value: string | undefined): string => `--at: HH:MM time expected (got "${value}")`,
    cronSaysAll: "--on and --at do not apply to --cron: the expression says it all",
    onNotDaily: "--on only applies to --every weekly or monthly",
    weekday: "--on: day of the week expected (mon, tue… sun)",
    monthDay: "--on: day of the month expected (1 to 28, or last)",
  },
  fr: {
    noTarget: "au moins un paquet provider:paquet requis",
    launcher: (value) => `--launcher : headless ou direct attendu (reçu « ${value} »)`,
    bothFrequencies: "--every et --cron s'excluent : choisissez l'un des deux",
    noFrequency:
      'fréquence requise : --every <daily|weekly|monthly> ou --cron "<m h j mois js>"',
    every: (value) => `--every : daily, weekly ou monthly attendu (reçu « ${value} »)`,
    at: (value) => `--at : heure HH:MM attendue (reçu « ${value} »)`,
    cronSaysAll: "--on et --at ne s'appliquent pas à --cron : l'expression dit tout",
    onNotDaily: "--on ne s'applique qu'à --every weekly ou monthly",
    weekday: "--on : jour de la semaine attendu (lun, mar… dim)",
    monthDay: "--on : jour du mois attendu (1 à 28, ou dernier)",
  },
});

/** What a validation problem is about, by field, when it is not one package. */
export const ISSUE_SUBJECTS = localized<Readonly<Record<string, string>>>({
  en: { name: "name", recurrence: "frequency", targets: "packages", schedules: "schedules" },
  fr: { name: "nom", recurrence: "fréquence", targets: "paquets", schedules: "planifications" },
});

/** "× brew:git: Unknown provider: brew", "× name: name required". */
export function issueLine(subject: string, message: string): string {
  return `${STATUS_GLYPHS.failed} ${LINES.issue(subject, message)}`;
}

export function notSavedLine(reason: string): string {
  return `${STATUS_GLYPHS.failed} ${LINES.notSaved(reason)}`;
}

/** The first line of `list` and `status` where this platform has no trigger. */
export function unsupportedTriggerLine(reason: string): string {
  return LINES.unsupportedTrigger(reason);
}

/** The details of `gup schedule status`, under its first line. */
export const STATUS_DETAILS = localized({
  en: {
    location: (location: string): string => `  location: ${location}`,
    command: (argv: readonly string[], launcher: Launcher): string =>
      `  command: ${quoted(argv)} (launcher: ${launcher})`,
    installed: (at: string, gupVersion: string): string => `  installed: ${at} · gup ${gupVersion}`,
    enabledCount: (count: number): string => `  active schedules: ${count}`,
  },
  fr: {
    location: (location) => `  emplacement : ${location}`,
    command: (argv, launcher) => `  commande : ${quoted(argv)} (lanceur : ${launcher})`,
    installed: (at, gupVersion) => `  installé le : ${at} · gup ${gupVersion}`,
    enabledCount: (count) => `  planifications actives : ${count}`,
  },
});

/** The first line of `run-now`'s summary. */
export function runResultLine(status: string): string {
  return LINES.result(status);
}

/** An argv on one line, each argument in double quotes. */
function quoted(argv: readonly string[]): string {
  return argv.map((arg) => `"${arg}"`).join(" ");
}
