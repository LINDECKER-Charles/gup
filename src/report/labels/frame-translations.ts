import type { Translations } from "../../core/i18n/localized.js";
import { plural } from "./plural.js";

/** Not words: the same in every language. */
const BRAND = "gup";
const SEARCH_SHORTCUT = "/";

const en = {
  document: {
    title: "gup — Activity report ({period})",
    skipLink: "Skip to content",
    brand: BRAND,
    heading: "Activity report",
    noscript:
      "This report needs JavaScript to be displayed. The file contains no external resources.",
  },
  header: {
    period: "{label} · {from} to {to}",
    navigation: "Report sections",
    theme: "Theme",
    themes: { auto: "Auto", light: "Light", dark: "Dark" },
    print: "Print",
  },
  search: {
    label: "Search for a package, a provider or a message",
    /** Whole in the search box of a 320 px phone: the label says the rest. */
    placeholder: "Package, provider or message…",
    shortcut: SEARCH_SHORTCUT,
    active: "Search: “{query}”",
    clear: "Clear the search",
  },
  nav: {
    overview: "Overview",
    calendar: "Calendar",
    packages: "Packages",
    failures: "Failures",
    sessions: "Sessions",
  },
  pages: {
    overview: "What happened over the period, at a glance.",
    calendar: "Each square is a day: the darker it is, the more packages gup updated that day.",
    packages: "Every package updated or attempted, and its update cadence.",
    failures: "The updates that did not go through, grouped by package and by message.",
    sessions: "Every gup run: what it scanned and what it updated.",
  },
  banner: {
    truncated:
      "Truncated report: only the {kept} most recent attempts are detailed (the figures cover " +
      "the whole period). Narrow the period (--since) to see everything.",
  },
  footer: {
    generated: "Generated locally by gup {version} on {date} ({zone}).",
    privacy: "This file makes no network request and holds only data from this machine.",
    malformed: plural(
      "{n} unreadable history line was ignored.",
      "{n} unreadable history lines were ignored.",
    ),
    unsupported: plural(
      "{n} line written by a newer version of gup was ignored.",
      "{n} lines written by a newer version of gup were ignored.",
    ),
    help: "How to read this report",
    helpItems: [
      "Success rate: successes / (successes + failures). A skipped update is not a failure.",
      "Median interval: the typical time between two successful updates of a package; a " +
        "success less than an hour after the previous one counts as the same update.",
      "Cadence: weekly up to 10 days, monthly up to 45, quarterly up to 120, rare beyond.",
      "Outdated packages: the last full scan of each day (without --fast or a filter).",
      "Days are those of the time zone of the machine that generated the report.",
    ],
  },
};

const fr: typeof en = {
  document: {
    title: "gup — Rapport d'activité ({period})",
    skipLink: "Aller au contenu",
    brand: BRAND,
    heading: "Rapport d'activité",
    noscript:
      "Ce rapport a besoin de JavaScript pour s'afficher. Le fichier ne contient aucune " +
      "ressource externe.",
  },
  header: {
    period: "{label} · du {from} au {to}",
    navigation: "Sections du rapport",
    theme: "Thème",
    themes: { auto: "Auto", light: "Clair", dark: "Sombre" },
    print: "Imprimer",
  },
  search: {
    label: "Rechercher un paquet, un provider ou un message",
    placeholder: "Paquet, provider ou message…",
    shortcut: SEARCH_SHORTCUT,
    active: "Recherche : « {query} »",
    clear: "Effacer la recherche",
  },
  nav: {
    overview: "Vue d'ensemble",
    calendar: "Calendrier",
    packages: "Paquets",
    failures: "Échecs",
    sessions: "Sessions",
  },
  pages: {
    overview: "Ce qui s'est passé sur la période, en un coup d'œil.",
    calendar:
      "Chaque case est un jour : plus elle est foncée, plus gup a mis de paquets à jour ce " +
      "jour-là.",
    packages: "Tous les paquets mis à jour ou tentés, et leur rythme de mise à jour.",
    failures: "Les mises à jour qui n'ont pas abouti, regroupées par paquet et par message.",
    sessions: "Chaque lancement de gup : ce qu'il a analysé et ce qu'il a mis à jour.",
  },
  banner: {
    truncated:
      "Rapport tronqué : seules les {kept} tentatives les plus récentes sont détaillées (les " +
      "chiffres couvrent toute la période). Réduisez la période (--since) pour tout voir.",
  },
  footer: {
    generated: "Généré localement par gup {version} le {date} ({zone}).",
    privacy:
      "Ce fichier ne fait aucune requête réseau et ne contient que des données de cette machine.",
    malformed: plural(
      "{n} ligne d'historique illisible a été ignorée.",
      "{n} lignes d'historique illisibles ont été ignorées.",
    ),
    unsupported: plural(
      "{n} ligne écrite par une version plus récente de gup a été ignorée.",
      "{n} lignes écrites par une version plus récente de gup ont été ignorées.",
    ),
    help: "Comment lire ce rapport",
    helpItems: [
      "Taux de réussite : réussies / (réussies + échecs). Une mise à jour ignorée n'est pas " +
        "un échec.",
      "Intervalle médian : le temps typique entre deux mises à jour réussies d'un paquet ; une " +
        "réussite moins d'une heure après la précédente compte pour la même mise à jour.",
      "Rythme : hebdomadaire jusqu'à 10 jours, mensuel jusqu'à 45, trimestriel jusqu'à 120, rare " +
        "au-delà.",
      "Paquets en retard : le dernier scan complet de chaque jour (sans --fast ni filtre).",
      "Les jours sont ceux du fuseau horaire de la machine qui a généré le rapport.",
    ],
  },
};

/**
 * The page around the data: its title, the header (period, search, theme,
 * print), the navigation, each page's lead, the truncation banner and the
 * footer.
 */
export const FRAME_TRANSLATIONS: Translations<typeof en> = { en, fr };
