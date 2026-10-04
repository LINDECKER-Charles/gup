import { localized } from "../../../core/i18n/localized.js";
import type { Recurrence } from "../../../core/scheduler/model/types.js";

/**
 * The schedule editor of the menu's Schedules view, in the interface's
 * languages: its titles, fields, buttons and dialogs. The rest of the view
 * speaks through `schedule-menu-labels.ts`.
 */

export const EDITOR_TITLES = localized({
  en: {
    create: "New schedule",
    edit: (name: string) => `Edit "${name}"`,
  },
  fr: {
    create: "Nouvelle planification",
    edit: (name) => `Modifier « ${name} »`,
  },
});

export const FIELD_LABELS = localized({
  en: {
    name: "Name",
    frequency: "Frequency",
    day: "Day",
    time: "Time",
    cron: "Cron expression",
    catchUp: "Catch-up",
  },
  fr: {
    name: "Nom",
    frequency: "Fréquence",
    day: "Jour",
    time: "Heure",
    cron: "Expression cron",
    catchUp: "Rattrapage",
  },
});

export const FREQUENCY_LABELS = localized<Readonly<Record<Recurrence["kind"], string>>>({
  en: {
    daily: "Every day",
    weekly: "Every week",
    monthly: "Every month",
    cron: "Custom (cron)",
  },
  fr: {
    daily: "Chaque jour",
    weekly: "Chaque semaine",
    monthly: "Chaque mois",
    cron: "Personnalisée (cron)",
  },
});

export const CATCH_UP_VALUES = localized({
  en: {
    on: "yes",
    off: "no",
    help: "runs at the next opportunity if the time is missed",
  },
  fr: {
    on: "oui",
    off: "non",
    help: "relance à la prochaine occasion si l'heure est manquée",
  },
});

export const EDITOR_TEXT = localized({
  en: {
    targets: (count: number) => `Packages (${count})`,
    addTarget: "+ Add a package…",
    save: "[ Save ]",
    cancel: "[ Cancel ]",
    adminNote: "administrator rights required: will be skipped",
    preview: (cron: string, runs: readonly string[]) =>
      `cron ${cron} · next: ${runList(runs, "none")}`,
    fixFirst: "Fix the flagged fields before saving.",
    /** The Day field of a schedule run on the last day of the month. */
    lastMonthDay: "last day of the month",
  },
  fr: {
    targets: (count) => `Paquets (${count})`,
    addTarget: "+ Ajouter un paquet…",
    save: "[ Enregistrer ]",
    cancel: "[ Annuler ]",
    adminNote: "droits administrateur requis : sera ignoré",
    preview: (cron, runs) => `cron ${cron} · prochaines : ${runList(runs, "aucune")}`,
    fixFirst: "Corrigez les champs signalés avant d'enregistrer.",
    lastMonthDay: "dernier jour du mois",
  },
});

/** The frequency chooser bears its field's name. */
export const FREQUENCY_DIALOG = {
  get title(): string {
    return FIELD_LABELS.frequency;
  },
};

export const WEEKDAY_DIALOG = localized({
  en: { title: "Day of the week" },
  fr: { title: "Jour de la semaine" },
});

export const MONTH_DAY_DIALOG = localized({
  en: {
    title: "Day of the month",
    text: '1 to 28, or "last" for the last day of the month.',
    invalid: "1 to 28, or last",
    /** What to type for the last day; the other language's word is accepted too. */
    last: "last",
  },
  fr: {
    title: "Jour du mois",
    text: "1 à 28, ou « dernier » pour le dernier jour du mois.",
    invalid: "1 à 28, ou dernier",
    last: "dernier",
  },
});

export const ADD_TARGET_DIALOG = localized({
  en: {
    title: "Add a package",
    text: 'provider:package, with the id "gup list" shows — for example winget:Git.Git.',
  },
  fr: {
    title: "Ajouter un paquet",
    text:
      "provider:paquet, avec l'identifiant que « gup list » affiche — par exemple " +
      "winget:Git.Git.",
  },
});

export const LEAVE_DIALOG = localized({
  en: {
    title: "Discard the changes?",
    text: "The changes to this schedule will be lost.",
  },
  fr: {
    title: "Abandonner les modifications ?",
    text: "Les changements de cette planification seront perdus.",
  },
});

/** Leaving the editor of a schedule never saved, changed or not. */
export const LEAVE_NEW_DIALOG = localized({
  en: {
    title: "Discard the new schedule?",
    text: "It has not been saved yet.",
  },
  fr: {
    title: "Abandonner la nouvelle planification ?",
    text: "Elle n'a pas encore été enregistrée.",
  },
});

/** The next runs on one line, or `none` when there is none. */
function runList(runs: readonly string[], none: string): string {
  return runs.length > 0 ? runs.join(" · ") : none;
}
