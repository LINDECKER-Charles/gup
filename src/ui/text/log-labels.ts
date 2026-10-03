import type { LogLevel, LogThreshold } from "../../core/log/log.js";
import type { UpdateStatus } from "../../core/history/types.js";

/**
 * The debug log's words (French, the language of the interface): `gup log`
 * and its options, the log lines it prints, the `gup doctor` line, the
 * diagnostic archive messages. Tests import these constants.
 */

/** Level column of a log line, all six characters wide or less. */
export const LEVEL_LABELS: Readonly<Record<LogLevel, string>> = {
  error: "ERREUR",
  warn: "AVERT.",
  info: "INFO",
  debug: "DEBUG",
  trace: "TRACE",
};

/** Marks a record the elevated child wrote. */
export const ELEVATED_MARK = "[admin]";

export const UPDATE_STATUS_LABELS: Readonly<Record<UpdateStatus, string>> = {
  success: "réussie",
  failed: "échec",
  skipped: "ignorée",
};

export const COMMAND_END_LABELS = {
  timedOut: "délai dépassé",
  aborted: "interrompue",
} as const;

export const LOG_LEVEL_OPTION = "niveau du journal de debug pour cette exécution";

export const LOG_COMMAND_LABELS = {
  log: "Affiche le journal de debug (diagnostic des scans et des mises à jour).",
  show: "Affiche les dernières lignes du journal de debug.",
  path: "Affiche le dossier du journal de debug.",
  export: "Crée une archive de diagnostic (.zip) à joindre à un rapport de bug.",
  lines: "nombre de lignes (défaut 50)",
  level: "niveau minimal : error, warn, info, debug, trace",
  since: "période : 7d, 30d, 12w, 6m, 1y, all ou AAAA-MM-JJ (défaut 7d)",
  grep: "ne garder que les lignes contenant ce texte",
  json: "lignes JSON brutes",
  out: "fichier de sortie (défaut : dossier des rapports)",
  force: "écrase le fichier --out s'il existe",
} as const;

export const LOG_MESSAGES = {
  noDirectory: "aucun dossier de journal sur cette plateforme",
  empty: "journal vide sur cette période",
  unreadable: (reason: string) => `journal illisible : ${reason}`,
  archiveWritten: (path: string) => `  archive de diagnostic : ${path}`,
  archiveReview:
    "  relisez-la avant de la partager : les secrets connus sont masqués, les chemins abrégés en ~",
  malformed: (count: number) => `${count} ligne(s) illisible(s) ignorée(s)`,
  exists: (path: string) => `${path} existe déjà — utilisez --force pour l'écraser`,
  exportFailed: (reason: string) => `export impossible : ${reason}`,
  badLevel: (raw: string) => `niveau inconnu : ${raw} (error, warn, info, debug, trace)`,
  badThreshold: (raw: string) => `niveau inconnu : ${raw} (error, warn, info, debug, trace, off)`,
  badSince: (raw: string) => `période invalide : ${raw} (ex. 7d, 30d, 12m, all, 2026-01-01)`,
  badLines: (raw: string) => `nombre de lignes invalide : ${raw} (entier de 1 à 10000)`,
} as const;

/** `gup doctor` → Système. */
export const LOG_DIAGNOSTIC_LABELS = {
  label: "Journal de debug",
  off: "désactivé",
  unavailable: "aucun dossier de journal sur cette plateforme",
  failed: (reason: string) => `non écrit — ${reason}`,
  badEnv: (raw: string) => `GUP_LOG_LEVEL ignoré (« ${raw} » n'est pas un niveau)`,
} as const;

/** Where the effective threshold came from, as `gup doctor` says it. */
export const LOG_SOURCE_LABELS = {
  flag: "--log-level",
  env: "GUP_LOG_LEVEL",
  default: "défaut",
} as const;

export function thresholdLabel(threshold: LogThreshold): string {
  return threshold === "off" ? LOG_DIAGNOSTIC_LABELS.off : threshold;
}
