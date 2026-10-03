import AdmZip from "adm-zip";
import { LOG_FILE_PATTERN } from "../log/file-sink.js";
import { parseLogLine } from "../log/log-reader.js";
import { resanitizeRecord, sanitizeData } from "../log/sanitize-data.js";
import type { SystemSnapshot } from "../state/system-snapshot.js";

/**
 * The archive `gup log export` writes for a bug report: the debug log of the
 * last days and a description of the machine — nothing else (no history
 * events, no settings file, no environment beyond an allowlist).
 *
 * Every log line is parsed and redacted again on the way in: the redaction
 * rules may have improved since the line was written, and a line that is not
 * a record gup wrote is dropped rather than copied blind. Entry names are
 * fixed or validated log file names: nothing a user or a tool controls
 * becomes a path inside the archive.
 */

/** Log content an archive takes, newest files first; older ones are left out. */
export const MAX_DIAGNOSTIC_LOG_BYTES = 50 * 1024 * 1024;

export interface DiagnosticLog {
  /** The log file's own name (`gup-2026-10-03.jsonl`). */
  readonly name: string;
  readonly content: string;
}

export interface DiagnosticInput {
  readonly generatedAt: Date;
  readonly system: SystemSnapshot;
  readonly logs: readonly DiagnosticLog[];
}

export interface DiagnosticArchive {
  readonly zip: Buffer;
  /** Log records copied into the archive. */
  readonly records: number;
  /** Lines left out because they were not well-formed records. */
  readonly dropped: number;
}

const README_NAME = "README.txt";
const SYSTEM_NAME = "system.json";
const LOGS_DIR = "logs";
const JSON_INDENT = 2;

export function buildDiagnosticZip(input: DiagnosticInput): DiagnosticArchive {
  const zip = new AdmZip();
  const totals = { records: 0, dropped: 0 };
  const included: string[] = [];
  for (const log of input.logs) {
    if (!LOG_FILE_PATTERN.test(log.name)) continue;
    const content = redactLogContent(log.content, totals);
    zip.addFile(`${LOGS_DIR}/${log.name}`, Buffer.from(content, "utf8"));
    included.push(log.name);
  }
  const system = JSON.stringify(sanitizeData(input.system) ?? {}, null, JSON_INDENT);
  zip.addFile(SYSTEM_NAME, Buffer.from(`${system}\n`, "utf8"));
  zip.addFile(README_NAME, Buffer.from(readme(input, included, totals.dropped), "utf8"));
  return { zip: zip.toBuffer(), ...totals };
}

/** Each record of a log file, redacted again; anything else dropped and counted. */
function redactLogContent(content: string, totals: { records: number; dropped: number }): string {
  const lines: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const record = parseLogLine(line);
    if (record) lines.push(JSON.stringify(resanitizeRecord(record)));
    else totals.dropped += 1;
  }
  totals.records += lines.length;
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function readme(input: DiagnosticInput, logs: readonly string[], dropped: number): string {
  const { generatedAt, system } = input;
  const lines = [
    "Archive de diagnostic gup",
    "",
    `Générée le ${generatedAt.toISOString()} par gup ${system.gup}`,
    `(${system.platform} ${system.arch}, Node ${system.node}).`,
    "",
    "Contenu :",
    `  ${SYSTEM_NAME}   versions, plateforme et variables d'environnement propres à gup`,
    "                (liste fermée : le reste de l'environnement n'est jamais copié)",
    `  ${LOGS_DIR}/         journal de debug, ${logs.length} fichier(s)`,
    ...logs.map((name) => `                  ${name}`),
    "",
    "Les secrets reconnus (jetons, mots de passe, clés, identifiants dans les URL)",
    "sont masqués par ***, et le dossier personnel est abrégé en ~.",
    "Rien n'a été envoyé : cette archive n'existe que sur votre machine.",
    "",
    "Relisez-la avant de la joindre à un rapport de bug : un secret dans un",
    "format inconnu de gup pourrait subsister.",
    ...(dropped > 0 ? ["", `${dropped} ligne(s) illisible(s) du journal ont été omise(s).`] : []),
  ];
  return `${lines.join("\n")}\n`;
}
