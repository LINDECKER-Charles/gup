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

/** The archive's fixed entry names (log files go under `logs/`). */
export const DIAGNOSTIC_ENTRIES = {
  readme: "README.txt",
  system: "system.json",
  logs: "logs",
} as const;

/** What an archive holds, for its README. */
export interface DiagnosticContents {
  readonly generatedAt: Date;
  readonly system: SystemSnapshot;
  /** The log files copied, by name. */
  readonly logs: readonly string[];
  /** Log lines left out because they were not well-formed records. */
  readonly dropped: number;
}

export interface DiagnosticInput {
  readonly generatedAt: Date;
  readonly system: SystemSnapshot;
  readonly logs: readonly DiagnosticLog[];
  /** The README, in the interface's language: what is inside, what to check before sharing. */
  readonly readme: (contents: DiagnosticContents) => string;
}

export interface DiagnosticArchive {
  readonly zip: Buffer;
  /** Log records copied into the archive. */
  readonly records: number;
  /** Lines left out because they were not well-formed records. */
  readonly dropped: number;
}

const JSON_INDENT = 2;

export function buildDiagnosticZip(input: DiagnosticInput): DiagnosticArchive {
  const zip = new AdmZip();
  const totals = { records: 0, dropped: 0 };
  const included: string[] = [];
  for (const log of input.logs) {
    if (!LOG_FILE_PATTERN.test(log.name)) continue;
    const content = redactLogContent(log.content, totals);
    zip.addFile(`${DIAGNOSTIC_ENTRIES.logs}/${log.name}`, Buffer.from(content, "utf8"));
    included.push(log.name);
  }
  const system = JSON.stringify(sanitizeData(input.system) ?? {}, null, JSON_INDENT);
  zip.addFile(DIAGNOSTIC_ENTRIES.system, Buffer.from(`${system}\n`, "utf8"));
  const { generatedAt } = input;
  const readme = input.readme({ generatedAt, system: input.system, logs: included, ...totals });
  zip.addFile(DIAGNOSTIC_ENTRIES.readme, Buffer.from(readme, "utf8"));
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
