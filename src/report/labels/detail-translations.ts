import type { Translations } from "../../core/i18n/localized.js";
import { plural } from "./plural.js";

/** Not words: the same marks in every language. */
const SORT_ICONS = { ascending: "↑", descending: "↓" } as const;

const en = {
  calendar: {
    intro: "Arrows to browse the days, Enter to see the sessions of the chosen day.",
    gridLabel: "Activity in {year}",
    weekdays: ["Mon", "", "Wed", "", "Fri", "", "Sun"],
    fewer: "Less",
    more: "More",
    nothing: "no activity",
    openDay: "See this day's sessions",
    /** A day of the grid as assistive technologies name it: its date, then what happened. */
    dayLabel: "{day}: {summary}",
  },
  packages: {
    caption: "Packages of the period",
    none: "No package updated over this period.",
    noneHint: "Packages show up here from their first update attempt.",
    noMatch: "No package matches the filters.",
    provider: "Provider",
    allProviders: "All providers",
    cadence: "Cadence",
    allCadences: "All cadences",
    countOf: plural("{n} package of {total}", "{n} packages of {total}"),
    columns: {
      name: "Package",
      provider: "Provider",
      successes: "Updates",
      failures: "Failures",
      lastVersion: "Last version",
      lastAt: "Last attempt",
      interval: "Median interval",
      cadence: "Cadence",
    },
    sortIcons: SORT_ICONS,
  },
  drawer: {
    close: "Close",
    copy: "Copy the ID",
    copied: "ID copied",
    copyFailed: "Could not copy",
    facts: {
      successes: "Succeeded",
      failures: "Failed",
      skips: "Skipped",
      interval: "Median interval",
      cadence: "Cadence",
      lastVersion: "Last version",
      firstAt: "First attempt",
      lastAt: "Last attempt",
    },
    versions: "Installed versions",
    noVersion: "No successful update over this period.",
    allVersions: "Show all {n} versions",
    unknownVersions: "unspecified versions",
    attempts: "Attempts ({n})",
  },
  attempt: {
    retry: "Retry: {label}",
    elevated: "Administrator rights",
    scheduled: "Scheduled",
  },
  failures: {
    intro: "{failures} across {packages}, most frequent first.",
    none: "No failure over this period.",
    noneHint: "Every update attempted succeeded or was skipped.",
    times: "{n}×",
    last: "Last failure on {when}",
    noMessage: "(no message)",
    open: "See the package →",
  },
  sessions: {
    none: "No session over this period.",
    noMatch: "No session matches the filters.",
    statuses: "Results shown",
    provider: "Provider",
    day: "Day: {day}",
    clearDay: "Clear the day filter",
    scanOnly: "Scan only, no update.",
  },
};

const fr: typeof en = {
  calendar: {
    intro: "Flèches pour parcourir les jours, Entrée pour voir les sessions du jour choisi.",
    gridLabel: "Activité de {year}",
    weekdays: ["lun", "", "mer", "", "ven", "", "dim"],
    fewer: "Moins",
    more: "Plus",
    nothing: "aucune activité",
    openDay: "Voir les sessions de ce jour",
    dayLabel: "{day} : {summary}",
  },
  packages: {
    caption: "Paquets de la période",
    none: "Aucun paquet mis à jour sur cette période.",
    noneHint: "Les paquets apparaissent ici dès leur première tentative de mise à jour.",
    noMatch: "Aucun paquet ne correspond aux filtres.",
    provider: "Provider",
    allProviders: "Tous les providers",
    cadence: "Rythme",
    allCadences: "Tous les rythmes",
    countOf: plural("{n} paquet sur {total}", "{n} paquets sur {total}"),
    columns: {
      name: "Paquet",
      provider: "Provider",
      successes: "Mises à jour",
      failures: "Échecs",
      lastVersion: "Dernière version",
      lastAt: "Dernière tentative",
      interval: "Intervalle médian",
      cadence: "Rythme",
    },
    sortIcons: SORT_ICONS,
  },
  drawer: {
    close: "Fermer",
    copy: "Copier l'identifiant",
    copied: "Identifiant copié",
    copyFailed: "Copie impossible",
    facts: {
      successes: "Réussies",
      failures: "Échecs",
      skips: "Ignorées",
      interval: "Intervalle médian",
      cadence: "Rythme",
      lastVersion: "Dernière version",
      firstAt: "Première tentative",
      lastAt: "Dernière tentative",
    },
    versions: "Versions installées",
    noVersion: "Aucune mise à jour réussie sur cette période.",
    allVersions: "Afficher les {n} versions",
    unknownVersions: "versions non précisées",
    attempts: "Tentatives ({n})",
  },
  attempt: {
    retry: "Nouvel essai : {label}",
    elevated: "Droits administrateur",
    scheduled: "Planifiée",
  },
  failures: {
    intro: "{failures} sur {packages}, du plus fréquent au plus rare.",
    none: "Aucun échec sur cette période.",
    noneHint: "Toutes les mises à jour tentées ont abouti ou ont été ignorées.",
    times: "{n} fois",
    last: "Dernier échec le {when}",
    noMessage: "(aucun message)",
    open: "Voir le paquet →",
  },
  sessions: {
    none: "Aucune session sur cette période.",
    noMatch: "Aucune session ne correspond aux filtres.",
    statuses: "Résultats affichés",
    provider: "Provider",
    day: "Jour : {day}",
    clearDay: "Effacer le filtre du jour",
    scanOnly: "Analyse seule, sans mise à jour.",
  },
};

/**
 * The pages a reader digs into: the calendar, the packages table and a
 * package's drawer with its attempts, the failures, the sessions.
 */
export const DETAIL_TRANSLATIONS: Translations<typeof en> = { en, fr };
