import { localized } from "../../../core/i18n/localized.js";
import type { RunTrigger } from "../../../core/state/run-context.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { counted } from "../format.js";
import type { LOG_SOURCE_LABELS } from "./log-labels.js";

/**
 * The journal view's words, in the interface's languages: tabs, key hints,
 * list headers, detail fields, the export dialog and its outcome. Shared
 * vocabulary of the activity (periods, numbers, cadences) lives in
 * `activity-labels.ts`. Tests import these catalogs.
 */

/** The tab bar, in the order of the keys 1 to 4. */
type TabNames = readonly [activity: string, recurrence: string, events: string, debug: string];

export const JOURNAL_LABELS = localized({
  en: {
    view: "Journal",
    title: (period: string) => `Journal · ${period}`,
    reloading: " …",
    loading: "loading the journal…",
    unreadable: (reason: string) => `Cannot read the journal: ${reason}`,
    recordingOff: "Recording off (GUP_HISTORY=0) — only the existing data is shown.",
    widenHint: "p to widen the period.",
    tabs: ["Activity", "Recurrence", "Events", "Debug"] as TabNames,
  },
  fr: {
    view: "Journal",
    title: (period) => `Journal · ${period}`,
    reloading: " …",
    loading: "chargement du journal…",
    unreadable: (reason) => `Journal illisible : ${reason}`,
    recordingOff:
      "Enregistrement désactivé (GUP_HISTORY=0) — seules les données existantes sont affichées.",
    widenHint: "p pour élargir la période.",
    tabs: ["Activité", "Récurrence", "Événements", "Debug"],
  },
});

export const JOURNAL_HINTS = localized({
  en: {
    activity: "1-4 tabs · p period · o HTML report · e export · r reload",
    recurrence: "↑↓ navigate · enter details · s sort · p period · e export",
    events: "↑↓ navigate · / filter · f type · enter details · e export",
    debug: "↑↓ navigate · l level · / filter · enter details · x diagnostic",
    detail: "↑↓ scroll · esc back",
    typing: "type to filter · enter confirm · esc clear",
    /** On the results of an update run in the screen. */
    report: "o HTML report",
  },
  fr: {
    activity: "1-4 onglets · p période · o rapport HTML · e exporter · r recharger",
    recurrence: "↑↓ naviguer · entrée détails · s tri · p période · e exporter",
    events: "↑↓ naviguer · / filtrer · f type · entrée détails · e exporter",
    debug: "↑↓ naviguer · l niveau · / filtrer · entrée détails · x diagnostic",
    detail: "↑↓ défiler · échap retour",
    typing: "tapez pour filtrer · entrée valider · échap effacer",
    report: "o rapport HTML",
  },
});

export const RECURRENCE_LABELS = localized({
  en: {
    title: "Most updated packages",
    sort: (mode: string) => `sort: ${mode} (s)`,
    sorts: { frequency: "frequency", failures: "failures", recent: "most recent" },
    empty: "No package updated in this period.",
    successes: "Successful updates",
    failures: "Failures",
    skips: "Skipped",
    interval: "Median interval",
    cadence: "Pace",
    first: "First attempt",
    last: "Last attempt",
    versions: "Latest versions installed",
  },
  fr: {
    title: "Paquets les plus souvent mis à jour",
    sort: (mode) => `tri : ${mode} (s)`,
    sorts: { frequency: "fréquence", failures: "échecs", recent: "plus récent" },
    empty: "Aucun paquet mis à jour sur cette période.",
    successes: "Mises à jour réussies",
    failures: "Échecs",
    skips: "Ignorées",
    interval: "Intervalle médian",
    cadence: "Rythme",
    first: "Première tentative",
    last: "Dernière tentative",
    versions: "Dernières versions installées",
  },
});

export const EVENT_LABELS = localized({
  en: {
    type: (label: string) => `type: ${label} (f)`,
    types: {
      all: "all",
      updates: "updates",
      failures: "failures",
      skips: "skipped",
      scans: "scans",
    },
    count: (count: number) => counted(count, "event", "events"),
    scan: "scan",
    scanSummary: (providers: number, outdated: number) =>
      `${counted(providers, "provider", "providers")} · ${outdated} outdated`,
    noMatch: "No matching event.",
    update: "Update",
    date: "Date",
    status: "Status",
    versions: "Versions",
    duration: "Duration",
    retry: "Retry",
    elevated: "Admin rights",
    yes: "yes",
    schedule: "Schedule",
    trigger: "Trigger",
    session: "Session",
    message: "Message",
    mode: "Mode",
    fast: "fast (slow providers left out)",
    full: "full",
    filter: "Providers",
    allProviders: "all providers",
    providers: "Result per provider",
    providerError: (message: string) => `error: ${message}`,
    outdated: (count: number) => `${count} outdated`,
  },
  fr: {
    type: (label) => `type : ${label} (f)`,
    types: {
      all: "tous",
      updates: "mises à jour",
      failures: "échecs",
      skips: "ignorées",
      scans: "scans",
    },
    count: (count) => counted(count, "événement", "événements"),
    scan: "scan",
    scanSummary: (providers, outdated) =>
      `${counted(providers, "provider", "providers")} · ${outdated} en retard`,
    noMatch: "Aucun événement ne correspond.",
    update: "Mise à jour",
    date: "Date",
    status: "Statut",
    versions: "Versions",
    duration: "Durée",
    retry: "Nouvel essai",
    elevated: "Droits admin",
    yes: "oui",
    schedule: "Planification",
    trigger: "Déclencheur",
    session: "Session",
    message: "Message",
    mode: "Mode",
    fast: "rapide (sans les providers lents)",
    full: "complet",
    filter: "Providers",
    allProviders: "tous les providers",
    providers: "Résultat par provider",
    providerError: (message) => `erreur : ${message}`,
    outdated: (count) => `${count} en retard`,
  },
});

export const TRIGGER_LABELS = localized<Readonly<Record<RunTrigger, string>>>({
  en: { menu: "menu", cli: "command line", schedule: "scheduled" },
  fr: { menu: "menu", cli: "ligne de commande", schedule: "planifié" },
});

export const DEBUG_LABELS = localized({
  en: {
    level: (label: string) => `level: ${label} (l)`,
    levels: { all: "all", debug: "≥ debug", info: "≥ info", warn: "≥ warn", error: "errors" },
    writing: (threshold: string, source: string) => `writing: ${threshold} (${source})`,
    count: (count: number) => counted(count, "line", "lines"),
    off: 'Debug log off (level "off").',
    /** How to turn it back on, by what turned it off. */
    offHint: {
      flag: "--log-level off only applies to this run.",
      env: "GUP_LOG_LEVEL=off forces it: unset it or choose a level (GUP_LOG_LEVEL=debug).",
      setting: "Turn it on in Options › Debug log.",
      default: "Turn it on in Options › Debug log.",
    } satisfies Readonly<Record<keyof typeof LOG_SOURCE_LABELS, string>>,
    empty: "No log line in this period.",
    noMatch: "No matching line.",
    unreadable: (reason: string) => `Cannot read the debug log: ${reason}`,
    historySkipped: (count: number) =>
      `${counted(count, "unreadable history line", "unreadable history lines")} skipped`,
    historyNewer: (count: number) =>
      `${counted(count, "history line", "history lines")} from a newer gup skipped`,
    logSkipped: (count: number) =>
      `${counted(count, "unreadable log line", "unreadable log lines")} skipped`,
    time: "Time",
    levelField: "Level",
    event: "Event",
    context: "Context",
    process: "Process",
    session: "Session",
    elevated: "Admin",
    data: "Data",
  },
  fr: {
    level: (label) => `niveau ${label} (l)`,
    levels: { all: "tout", debug: "≥ debug", info: "≥ info", warn: "≥ avert.", error: "erreurs" },
    writing: (threshold, source) => `écriture : ${threshold} (${source})`,
    count: (count) => counted(count, "ligne", "lignes"),
    off: "Journal de debug désactivé (niveau « off »).",
    offHint: {
      flag: "--log-level off ne vaut que pour cette exécution.",
      env: "GUP_LOG_LEVEL=off l'impose : retirez-la ou choisissez un niveau (GUP_LOG_LEVEL=debug).",
      setting: "Activez-le dans Options › Journal de debug.",
      default: "Activez-le dans Options › Journal de debug.",
    },
    empty: "Aucune ligne de journal sur cette période.",
    noMatch: "Aucune ligne ne correspond.",
    unreadable: (reason) => `Journal de debug illisible : ${reason}`,
    historySkipped: (count) => `${count} ligne(s) d'historique illisible(s) ignorée(s)`,
    historyNewer: (count) =>
      `${count} ligne(s) d'historique d'une version plus récente de gup ignorée(s)`,
    logSkipped: (count) => `${count} ligne(s) de journal illisible(s) ignorée(s)`,
    time: "Heure",
    levelField: "Niveau",
    event: "Événement",
    context: "Contexte",
    process: "Processus",
    session: "Session",
    elevated: "Admin",
    data: "Données",
  },
});

export const EXPORT_LABELS = localized({
  en: {
    title: "Export the journal",
    period: (label: string) => `Period: ${label}`,
    footer: "A standalone file, readable offline. Nothing is sent.",
    html: "HTML report (a page to read in the browser)",
    json: "JSON data (every event)",
    csv: "CSV spreadsheet (updates)",
    diagnostic: "Diagnostic .zip archive (for a bug report)",
    running: "exporting…",
    written: (path: string) => `${STATUS_GLYPHS.success} Export written — ${path}`,
    opened: (path: string) => `${STATUS_GLYPHS.success} Report opened in the browser — ${path}`,
    notOpened: (path: string) => `Report written but could not be opened — open: ${path}`,
    failed: (reason: string) => `${STATUS_GLYPHS.failed} Export failed: ${reason}`,
  },
  fr: {
    title: "Exporter le journal",
    period: (label) => `Période : ${label}`,
    footer: "Un fichier autonome, lisible hors ligne. Rien n'est envoyé.",
    html: "Rapport HTML (page à lire dans le navigateur)",
    json: "Données JSON (tous les événements)",
    csv: "Tableur CSV (mises à jour)",
    diagnostic: "Archive de diagnostic .zip (pour un rapport de bug)",
    running: "export en cours…",
    written: (path) => `${STATUS_GLYPHS.success} Export écrit — ${path}`,
    opened: (path) => `${STATUS_GLYPHS.success} Rapport ouvert dans le navigateur — ${path}`,
    notOpened: (path) => `Rapport écrit, ouverture automatique impossible — ouvrez : ${path}`,
    failed: (reason) => `${STATUS_GLYPHS.failed} Export impossible : ${reason}`,
  },
});
