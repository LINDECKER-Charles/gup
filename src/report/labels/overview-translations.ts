import type { Translations } from "../../core/i18n/localized.js";
import { plural } from "./plural.js";

const en = {
  overview: {
    summary: "Period summary",
    unit: plural("successful update", "successful updates"),
    // The rate last: "a 75%" but "an 87%", and no template can tell which.
    sentence: "{lead}, gup updated {packages} with a success rate of {rate}.",
    noSuccess: "{lead}, no update succeeded.",
    empty: "{lead}, gup recorded nothing. Widen the period to see more activity.",
    lastUpdate: "Last successful update {when}.",
    lastScan: "Last scan {when}.",
    noActivity: "No activity recorded.",
    activity: "Activity",
    activityIntro: "Successful updates per day, over the whole period.",
    /** A period longer than the calendar's 53 weeks: it shows the end of it. */
    activityIntroRecent: "Successful updates per day, over the last 12 months of the period.",
    openCalendar: "Open the calendar →",
    watch: "Needs attention",
    allFailures: "All failures →",
    top: "Most updated",
    allPackages: "All packages →",
  },
  kpi: {
    title: "Key figures",
    successRate: "Success rate",
    packages: "Packages updated",
    failures: "Failures",
    skips: "Skipped",
    scans: "Scans",
    outdated: "Outdated",
    hints: {
      successRate: "successes / (successes + failures)",
      packages: "at least one successful update",
      failures: "attempts that failed",
      skips: "skipped by you or by the provider",
      scans: "scans of the machine",
      outdated: "packages to update at the last scan",
    },
  },
  rhythm: {
    weekly: "Updates per week",
    monthly: "Updates per month",
    caption: "{attempts} over {count} periods: succeeded, failed and skipped.",
    empty: "No update attempt over this period.",
    week: "Week of {day}",
    columns: ["Period", "Succeeded", "Failed", "Skipped"],
  },
  outdated: {
    title: "Outdated packages",
    summary: "max {max} · min {min} · current {current}",
    caption: "Outdated packages at the last full scan of each day: {summary}.",
    empty: "No full scan over this period yet.",
    emptyHint: "A scan without --fast or a provider filter feeds this chart.",
    columns: ["Day", "Outdated packages"],
  },
  providers: {
    title: "Providers",
    columns: ["Provider", "Succeeded", "Failed", "Skipped", "Update time", "Scan time"],
  },
};

const fr: typeof en = {
  overview: {
    summary: "Résumé de la période",
    unit: plural("mise à jour réussie", "mises à jour réussies"),
    sentence: "{lead}, gup a mis à jour {packages} avec {rate} de réussite.",
    noSuccess: "{lead}, aucune mise à jour n'a abouti.",
    empty: "{lead}, gup n'a rien enregistré. Élargissez la période pour voir plus d'activité.",
    lastUpdate: "Dernière mise à jour réussie {when}.",
    lastScan: "Dernier scan {when}.",
    noActivity: "Aucune activité enregistrée.",
    activity: "Activité",
    activityIntro: "Mises à jour réussies par jour, sur toute la période.",
    activityIntroRecent: "Mises à jour réussies par jour, sur les 12 derniers mois de la période.",
    openCalendar: "Ouvrir le calendrier →",
    watch: "À surveiller",
    allFailures: "Tous les échecs →",
    top: "Les plus mis à jour",
    allPackages: "Tous les paquets →",
  },
  kpi: {
    title: "Chiffres clés",
    successRate: "Taux de réussite",
    packages: "Paquets mis à jour",
    failures: "Échecs",
    skips: "Ignorées",
    scans: "Scans",
    outdated: "En retard",
    hints: {
      successRate: "réussies / (réussies + échecs)",
      packages: "au moins une mise à jour réussie",
      failures: "tentatives qui ont échoué",
      skips: "passées par vous ou par le provider",
      scans: "analyses de la machine",
      outdated: "paquets à mettre à jour au dernier scan",
    },
  },
  rhythm: {
    weekly: "Mises à jour par semaine",
    monthly: "Mises à jour par mois",
    caption: "{attempts} sur {count} périodes, réussies, en échec et ignorées.",
    empty: "Aucune tentative de mise à jour sur cette période.",
    week: "Semaine du {day}",
    columns: ["Période", "Réussies", "Échecs", "Ignorées"],
  },
  outdated: {
    title: "Paquets en retard",
    summary: "max {max} · min {min} · actuel {current}",
    caption: "Paquets en retard au dernier scan complet de chaque jour : {summary}.",
    empty: "Pas encore de scan complet sur cette période.",
    emptyHint: "Un scan sans --fast ni filtre de providers alimente cette courbe.",
    columns: ["Jour", "Paquets en retard"],
  },
  providers: {
    title: "Providers",
    columns: [
      "Provider",
      "Réussies",
      "Échecs",
      "Ignorées",
      "Durée d'une mise à jour",
      "Durée du scan",
    ],
  },
};

/**
 * The overview page: its headline sentence and figure, the key numbers, the
 * activity, rhythm and outdated-packages charts with their tables, and the
 * providers' table.
 */
export const OVERVIEW_TRANSLATIONS: Translations<typeof en> = { en, fr };
