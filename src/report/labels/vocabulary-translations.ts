import type { Translations } from "../../core/i18n/localized.js";
import { plural } from "./plural.js";

/** Not words: the same marks in every language. */
const NONE_MARK = "—";
const STATUS_ICONS = { success: "✔", failed: "✖", skipped: "↷" } as const;

const en = {
  common: {
    none: NONE_MARK,
    showMore: "Show {n} more ({rest} left)",
  },
  units: {
    seconds: "{s} s",
    minutes: "{m} min {s} s",
    hours: "{h} h {m}",
    interval: "~{n} d",
    packages: plural("{n} package", "{n} packages"),
    successes: plural("{n} success", "{n} successes"),
    failures: plural("{n} failure", "{n} failures"),
    skips: plural("{n} skip", "{n} skips"),
    scans: plural("{n} scan", "{n} scans"),
    attempts: plural("{n} attempt", "{n} attempts"),
    sessions: plural("{n} session", "{n} sessions"),
    outdated: plural("{n} outdated package", "{n} outdated packages"),
  },
  status: {
    success: { icon: STATUS_ICONS.success, label: "Succeeded" },
    failed: { icon: STATUS_ICONS.failed, label: "Failed" },
    skipped: { icon: STATUS_ICONS.skipped, label: "Skipped" },
  },
  legend: { success: "Succeeded", failed: "Failed", skipped: "Skipped" },
  triggers: {
    menu: "Menu",
    cli: "Command line",
    schedule: "Scheduled",
    unknown: "Unknown source",
  },
  cadences: {
    weekly: "weekly",
    monthly: "monthly",
    quarterly: "quarterly",
    rare: "rare",
    once: "once",
    none: "never succeeded",
  },
  cadenceDescriptions: {
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    rare: "Rare",
    once: "Only once",
    none: "Never succeeded",
  },
  charts: { showData: "Show the data", hideData: "Hide the data" },
};

const fr: typeof en = {
  common: {
    none: NONE_MARK,
    showMore: "Afficher {n} de plus ({rest} restants)",
  },
  units: {
    seconds: "{s} s",
    minutes: "{m} min {s} s",
    hours: "{h} h {m}",
    interval: "~{n} j",
    packages: plural("{n} paquet", "{n} paquets"),
    successes: plural("{n} réussie", "{n} réussies"),
    failures: plural("{n} échec", "{n} échecs"),
    skips: plural("{n} ignorée", "{n} ignorées"),
    scans: plural("{n} scan", "{n} scans"),
    attempts: plural("{n} tentative", "{n} tentatives"),
    sessions: plural("{n} session", "{n} sessions"),
    outdated: plural("{n} paquet en retard", "{n} paquets en retard"),
  },
  status: {
    success: { icon: STATUS_ICONS.success, label: "Réussie" },
    failed: { icon: STATUS_ICONS.failed, label: "Échec" },
    skipped: { icon: STATUS_ICONS.skipped, label: "Ignorée" },
  },
  legend: { success: "Réussies", failed: "Échecs", skipped: "Ignorées" },
  triggers: {
    menu: "Menu",
    cli: "Ligne de commande",
    schedule: "Planifiée",
    unknown: "Origine inconnue",
  },
  cadences: {
    weekly: "hebdo.",
    monthly: "mensuel",
    quarterly: "trim.",
    rare: "rare",
    once: "une fois",
    none: "jamais réussie",
  },
  cadenceDescriptions: {
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
    quarterly: "Trimestriel",
    rare: "Rare",
    once: "Une seule fois",
    none: "Jamais réussie",
  },
  charts: { showData: "Voir les données", hideData: "Masquer les données" },
};

/**
 * The words every page shares: counts and their units, outcomes, what
 * started a session, a package's update cadence, the chart toggles.
 */
export const VOCABULARY_TRANSLATIONS: Translations<typeof en> = { en, fr };
