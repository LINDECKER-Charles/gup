import {
  DIAGNOSTIC_ENTRIES,
  type DiagnosticContents,
  type DiagnosticHistory,
} from "../../../core/export/diagnostic-bundle.js";
import { localized } from "../../../core/i18n/localized.js";
import type { LogLevel, LogThreshold } from "../../../core/log/log.js";
import type { UpdateStatus } from "../../../core/history/types.js";
import { counted } from "../format.js";

/**
 * The debug log's words, in the interface's languages: `gup log` and its
 * options, the log lines it prints, the `gup doctor` line, the diagnostic
 * archive's messages and README. Tests import these catalogs.
 */

/** Level column of a log line, all six characters wide or less. */
export const LEVEL_LABELS = localized<Readonly<Record<LogLevel, string>>>({
  en: { error: "ERROR", warn: "WARN", info: "INFO", debug: "DEBUG", trace: "TRACE" },
  fr: { error: "ERREUR", warn: "AVERT.", info: "INFO", debug: "DEBUG", trace: "TRACE" },
});

/** Marks a record the elevated child wrote; the same in every language. */
export const ELEVATED_MARK = "[admin]";

export const UPDATE_STATUS_LABELS = localized<Readonly<Record<UpdateStatus, string>>>({
  en: { success: "done", failed: "failed", skipped: "skipped" },
  fr: { success: "réussie", failed: "échec", skipped: "ignorée" },
});

export const COMMAND_END_LABELS = localized({
  en: { timedOut: "timed out", aborted: "aborted" },
  fr: { timedOut: "délai dépassé", aborted: "interrompue" },
});

/** What an option of `gup log`, `gup report` or `--log-level` takes, as `--help` names it. */
export const VALUE_PLACEHOLDERS = localized({
  en: {
    level: "<level>",
    period: "<period>",
    text: "<text>",
    file: "<file>",
    separator: "<separator>",
  },
  fr: {
    level: "<niveau>",
    period: "<période>",
    text: "<texte>",
    file: "<fichier>",
    separator: "<séparateur>",
  },
});

export const LOG_COMMAND_LABELS = localized({
  en: {
    log: "Shows the debug log (for diagnosing scans and updates).",
    show: "Shows the latest lines of the debug log.",
    path: "Shows the debug log's folder.",
    export: "Creates a diagnostic archive (.zip) to attach to a bug report.",
    /** The global `--log-level`, every command's. */
    logLevel: "debug log level for this run",
    lines: "number of lines (default 50)",
    level: "minimum level: error, warn, info, debug, trace",
    since: "period: 7d, 30d, 12w, 6m, 1y, all or YYYY-MM-DD (default 7d)",
    grep: "only keep the lines containing this text",
    json: "raw JSON lines",
    out: "output file (default: the reports folder)",
    force: "overwrite the --out file if it exists",
    noHistory: "leave the activity summary out of the archive",
  },
  fr: {
    log: "Affiche le journal de debug (diagnostic des scans et des mises à jour).",
    show: "Affiche les dernières lignes du journal de debug.",
    path: "Affiche le dossier du journal de debug.",
    export: "Crée une archive de diagnostic (.zip) à joindre à un rapport de bug.",
    logLevel: "niveau du journal de debug pour cette exécution",
    lines: "nombre de lignes (défaut 50)",
    level: "niveau minimal : error, warn, info, debug, trace",
    since: "période : 7d, 30d, 12w, 6m, 1y, all ou AAAA-MM-JJ (défaut 7d)",
    grep: "ne garder que les lignes contenant ce texte",
    json: "lignes JSON brutes",
    out: "fichier de sortie (défaut : dossier des rapports)",
    force: "écrase le fichier --out s'il existe",
    noHistory: "n'inclut pas le résumé d'activité dans l'archive",
  },
});

export const LOG_MESSAGES = localized({
  en: {
    noDirectory: "no log folder on this platform",
    empty: "log empty for this period",
    unreadable: (reason: string) => `cannot read the log: ${reason}`,
    archiveWritten: (path: string) => `  diagnostic archive: ${path}`,
    archiveReview:
      "  review it before sharing it: known secrets are masked, paths shortened to ~",
    malformed: (count: number) =>
      `${counted(count, "unreadable line", "unreadable lines")} skipped`,
    exists: (path: string) => `${path} already exists — use --force to overwrite it`,
    exportFailed: (reason: string) => `export failed: ${reason}`,
    badLevel: (raw: string) => `unknown level: ${raw} (error, warn, info, debug, trace)`,
    badThreshold: (raw: string) =>
      `unknown level: ${raw} (error, warn, info, debug, trace, off)`,
    badSince: (raw: string) => `invalid period: ${raw} (e.g. 7d, 30d, 12m, all, 2026-01-01)`,
    badLines: (raw: string) => `invalid number of lines: ${raw} (whole number from 1 to 10000)`,
  },
  fr: {
    noDirectory: "aucun dossier de journal sur cette plateforme",
    empty: "journal vide sur cette période",
    unreadable: (reason) => `journal illisible : ${reason}`,
    archiveWritten: (path) => `  archive de diagnostic : ${path}`,
    archiveReview:
      "  relisez-la avant de la partager : les secrets connus sont masqués, " +
      "les chemins abrégés en ~",
    malformed: (count) => `${count} ligne(s) illisible(s) ignorée(s)`,
    exists: (path) => `${path} existe déjà — utilisez --force pour l'écraser`,
    exportFailed: (reason) => `export impossible : ${reason}`,
    badLevel: (raw) => `niveau inconnu : ${raw} (error, warn, info, debug, trace)`,
    badThreshold: (raw) => `niveau inconnu : ${raw} (error, warn, info, debug, trace, off)`,
    badSince: (raw) => `période invalide : ${raw} (ex. 7d, 30d, 12m, all, 2026-01-01)`,
    badLines: (raw) => `nombre de lignes invalide : ${raw} (entier de 1 à 10000)`,
  },
});

/** `gup doctor` → System. */
export const LOG_DIAGNOSTIC_LABELS = localized({
  en: {
    label: "Debug log",
    off: "off",
    unavailable: "no log folder on this platform",
    failed: (reason: string) => `not written — ${reason}`,
    badEnv: (raw: string) => `GUP_LOG_LEVEL ignored ("${raw}" is not a level)`,
  },
  fr: {
    label: "Journal de debug",
    off: "désactivé",
    unavailable: "aucun dossier de journal sur cette plateforme",
    failed: (reason) => `non écrit — ${reason}`,
    badEnv: (raw) => `GUP_LOG_LEVEL ignoré (« ${raw} » n'est pas un niveau)`,
  },
});

/** Where the effective threshold came from, as `gup doctor` says it. */
export const LOG_SOURCE_LABELS = localized({
  en: { flag: "--log-level", env: "GUP_LOG_LEVEL", setting: "setting", default: "default" },
  fr: { flag: "--log-level", env: "GUP_LOG_LEVEL", setting: "réglage", default: "défaut" },
});

export function thresholdLabel(threshold: LogThreshold): string {
  return threshold === "off" ? LOG_DIAGNOSTIC_LABELS.off : threshold;
}

/** The README's words; its layout (entry names, indents) is `diagnosticReadme`'s. */
const README_WORDS = localized({
  en: {
    title: "gup diagnostic archive",
    generated: (at: string, version: string) => `Generated on ${at} by gup ${version}`,
    contents: "Contents:",
    /** Each entry's description: its first line beside the entry, the next ones under it. */
    system: [
      "versions, platform and gup's own environment variables",
      "(an allowlist: the rest of the environment is never copied)",
    ],
    logs: (files: number) => `debug log, ${counted(files, "file", "files")}`,
    summary: [
      "summary of the period's activity (numbers,",
      "paces, failures), without the events themselves",
    ],
    unreadableHistory: (reason: string) =>
      `(no activity summary: history unreadable — ${reason})`,
    privacy: [
      "Known secrets (tokens, passwords, keys, credentials in URLs)",
      "are masked with ***, and the home folder is shortened to ~.",
      "Nothing was sent: this archive only exists on your machine.",
    ],
    review: [
      "Review it before attaching it to a bug report: a secret in a",
      "format gup does not know could remain.",
    ],
    dropped: (count: number) =>
      counted(count, "unreadable log line was left out", "unreadable log lines were left out"),
  },
  fr: {
    title: "Archive de diagnostic gup",
    generated: (at, version) => `Générée le ${at} par gup ${version}`,
    contents: "Contenu :",
    system: [
      "versions, plateforme et variables d'environnement propres à gup",
      "(liste fermée : le reste de l'environnement n'est jamais copié)",
    ],
    logs: (files) => `journal de debug, ${counted(files, "fichier", "fichiers")}`,
    summary: [
      "résumé de l'activité de la période (chiffres,",
      "rythmes, échecs), sans les événements eux-mêmes",
    ],
    unreadableHistory: (reason) =>
      `(pas de résumé d'activité : historique illisible — ${reason})`,
    privacy: [
      "Les secrets reconnus (jetons, mots de passe, clés, identifiants dans les URL)",
      "sont masqués par ***, et le dossier personnel est abrégé en ~.",
      "Rien n'a été envoyé : cette archive n'existe que sur votre machine.",
    ],
    review: [
      "Relisez-la avant de la joindre à un rapport de bug : un secret dans un",
      "format inconnu de gup pourrait subsister.",
    ],
    dropped: (count) =>
      counted(
        count,
        "ligne illisible du journal a été omise",
        "lignes illisibles du journal ont été omises",
      ),
  },
});

/** Where a description's second line starts: under the descriptions of the entries. */
const DESCRIPTION_INDENT = " ".repeat(16);
/** Where the log files are listed: under the logs folder's description. */
const LOG_FILE_INDENT = " ".repeat(18);

/** The README of the diagnostic archive: what is inside, and to read it before sharing it. */
export function diagnosticReadme(contents: DiagnosticContents): string {
  const { generatedAt, system, logs, dropped } = contents;
  const lines = [
    README_WORDS.title,
    "",
    README_WORDS.generated(generatedAt.toISOString(), system.gup),
    `(${system.platform} ${system.arch}, Node ${system.node}).`,
    "",
    README_WORDS.contents,
    ...described(DIAGNOSTIC_ENTRIES.system, README_WORDS.system),
    `  ${DIAGNOSTIC_ENTRIES.logs}/         ${README_WORDS.logs(logs.length)}`,
    ...logs.map((name) => `${LOG_FILE_INDENT}${name}`),
    ...historyLines(contents.history),
    "",
    ...README_WORDS.privacy,
    "",
    ...README_WORDS.review,
    ...(dropped > 0 ? ["", `${README_WORDS.dropped(dropped)}.`] : []),
  ];
  return `${lines.join("\n")}\n`;
}

/** An entry, then its description: the first line beside it, the next ones under it. */
function described(entry: string, description: readonly string[]): string[] {
  const [first = "", ...rest] = description;
  return [`  ${entry}   ${first}`, ...rest.map((line) => `${DESCRIPTION_INDENT}${line}`)];
}

/** The README's line on the activity summary; none when it was left out on request. */
function historyLines(history: DiagnosticHistory | undefined): string[] {
  if (history === undefined) return [];
  if ("unreadable" in history) return [`  ${README_WORDS.unreadableHistory(history.unreadable)}`];
  return described(DIAGNOSTIC_ENTRIES.history, README_WORDS.summary);
}
