import {
  DIAGNOSTIC_ENTRIES,
  type DiagnosticContents,
  type DiagnosticHistory,
} from "../../../core/export/diagnostic-bundle.js";
import type { LogLevel, LogThreshold } from "../../../core/log/log.js";
import type { UpdateStatus } from "../../../core/history/types.js";
import { counted } from "../fr-format.js";

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
  noHistory: "n'inclut pas le résumé d'activité dans l'archive",
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
  setting: "réglage",
  default: "défaut",
} as const;

export function thresholdLabel(threshold: LogThreshold): string {
  return threshold === "off" ? LOG_DIAGNOSTIC_LABELS.off : threshold;
}

/** The README of the diagnostic archive: what is inside, and to read it before sharing it. */
export function diagnosticReadme(contents: DiagnosticContents): string {
  const { generatedAt, system, logs, dropped } = contents;
  const lines = [
    "Archive de diagnostic gup",
    "",
    `Générée le ${generatedAt.toISOString()} par gup ${system.gup}`,
    `(${system.platform} ${system.arch}, Node ${system.node}).`,
    "",
    "Contenu :",
    `  ${DIAGNOSTIC_ENTRIES.system}   versions, plateforme et variables d'environnement ` +
      "propres à gup",
    "                (liste fermée : le reste de l'environnement n'est jamais copié)",
    `  ${DIAGNOSTIC_ENTRIES.logs}/         journal de debug, ` +
      counted(logs.length, "fichier", "fichiers"),
    ...logs.map((name) => `                  ${name}`),
    ...historyLines(contents.history),
    "",
    "Les secrets reconnus (jetons, mots de passe, clés, identifiants dans les URL)",
    "sont masqués par ***, et le dossier personnel est abrégé en ~.",
    "Rien n'a été envoyé : cette archive n'existe que sur votre machine.",
    "",
    "Relisez-la avant de la joindre à un rapport de bug : un secret dans un",
    "format inconnu de gup pourrait subsister.",
    ...(dropped > 0 ? ["", `${droppedLines(dropped)}.`] : []),
  ];
  return `${lines.join("\n")}\n`;
}

/** "1 ligne illisible du journal a été omise", "2 lignes … ont été omises". */
function droppedLines(count: number): string {
  return counted(
    count,
    "ligne illisible du journal a été omise",
    "lignes illisibles du journal ont été omises",
  );
}

/** The README's line on the activity summary; none when it was left out on request. */
function historyLines(history: DiagnosticHistory | undefined): string[] {
  if (history === undefined) return [];
  if ("unreadable" in history) {
    return [`  (pas de résumé d'activité : historique illisible — ${history.unreadable})`];
  }
  return [
    `  ${DIAGNOSTIC_ENTRIES.history}   résumé de l'activité de la période (chiffres,`,
    "                rythmes, échecs), sans les événements eux-mêmes",
  ];
}
