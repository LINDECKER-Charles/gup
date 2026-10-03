import type { RunTrigger } from "../../core/state/run-context.js";
import { STATUS_GLYPHS } from "../theme/glyphs.js";
import { counted } from "./activity-labels.js";

/**
 * The journal view's words (French, the language of the interface): tabs,
 * key hints, list headers, detail fields, the export dialog and its outcome.
 * Shared vocabulary of the activity (periods, numbers, cadences) lives in
 * `activity-labels.ts`. Tests import these constants.
 */

export const JOURNAL_LABELS = {
  view: "Journal",
  title: (period: string) => `Journal · ${period}`,
  reloading: " ↻",
  loading: "chargement du journal…",
  unreadable: (reason: string) => `Journal illisible : ${reason}`,
  recordingOff:
    "Enregistrement désactivé (GUP_HISTORY=0) — seules les données existantes sont affichées.",
  widenHint: "p pour élargir la période.",
} as const;

export const TAB_LABELS = ["Activité", "Récurrence", "Événements", "Debug"] as const;

export const JOURNAL_HINTS = {
  activity: "1-4 onglets · p période · o rapport HTML · e exporter · r recharger",
  recurrence: "↑↓ naviguer · entrée détails · s tri · p période · e exporter",
  events: "↑↓ naviguer · / filtrer · f type · entrée détails · e exporter",
  debug: "↑↓ naviguer · l niveau · / filtrer · entrée détails · x diagnostic",
  detail: "↑↓ défiler · échap retour",
  typing: "tapez pour filtrer · entrée valider · échap effacer",
} as const;

export const RECURRENCE_LABELS = {
  title: "Paquets les plus souvent mis à jour",
  sort: (mode: string) => `tri : ${mode} (s)`,
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
} as const;

export const EVENT_LABELS = {
  type: (label: string) => `type : ${label} (f)`,
  types: {
    all: "tous",
    updates: "mises à jour",
    failures: "échecs",
    skips: "ignorées",
    scans: "scans",
  },
  count: (count: number) => counted(count, "événement", "événements"),
  scan: "scan",
  scanSummary: (providers: number, outdated: number) =>
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
  providerError: (message: string) => `erreur : ${message}`,
  outdated: (count: number) => `${count} en retard`,
} as const;

export const TRIGGER_LABELS: Readonly<Record<RunTrigger, string>> = {
  menu: "menu",
  cli: "ligne de commande",
  schedule: "planifié",
};

export const DEBUG_LABELS = {
  level: (label: string) => `niveau ${label} (l)`,
  levels: { all: "tout", debug: "≥ debug", info: "≥ info", warn: "≥ avert.", error: "erreurs" },
  writing: (threshold: string, source: string) => `écriture : ${threshold} (${source})`,
  count: (count: number) => counted(count, "ligne", "lignes"),
  off: "Journal de debug désactivé (niveau « off »).",
  offHint: "Activez-le avec --log-level debug ou GUP_LOG_LEVEL=debug.",
  empty: "Aucune ligne de journal sur cette période.",
  noMatch: "Aucune ligne ne correspond.",
  unreadable: (reason: string) => `Journal de debug illisible : ${reason}`,
  historySkipped: (count: number) => `${count} ligne(s) d'historique illisible(s) ignorée(s)`,
  historyNewer: (count: number) =>
    `${count} ligne(s) d'historique d'une version plus récente de gup ignorée(s)`,
  logSkipped: (count: number) => `${count} ligne(s) de journal illisible(s) ignorée(s)`,
  time: "Heure",
  levelField: "Niveau",
  event: "Événement",
  context: "Contexte",
  process: "Processus",
  session: "Session",
  elevated: "Admin",
  data: "Données",
} as const;

export const EXPORT_LABELS = {
  title: "Exporter le journal",
  period: (label: string) => `Période : ${label}`,
  footer: "Un fichier autonome, lisible hors ligne. Rien n'est envoyé.",
  html: "Rapport HTML (s'ouvre dans le navigateur)",
  json: "Données JSON (tous les événements)",
  csv: "Tableur CSV (mises à jour)",
  diagnostic: "Archive de diagnostic .zip (pour un rapport de bug)",
  running: "export en cours…",
  written: (path: string) => `${STATUS_GLYPHS.success} Export écrit — ${path}`,
  opened: (path: string) => `${STATUS_GLYPHS.success} Rapport ouvert dans le navigateur — ${path}`,
  notOpened: (path: string) => `Rapport écrit, ouverture automatique impossible — ouvrez : ${path}`,
  failed: (reason: string) => `${STATUS_GLYPHS.failed} Export impossible : ${reason}`,
} as const;
