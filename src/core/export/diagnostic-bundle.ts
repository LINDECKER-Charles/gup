import AdmZip from "adm-zip";
import { LOG_FILE_PATTERN } from "../log/file-sink.js";
import { parseLogLine } from "../log/log-reader.js";
import { redactText } from "../log/redact.js";
import { resanitizeRecord, sanitizeData } from "../log/sanitize-data.js";
import type { SystemSnapshot } from "../state/system-snapshot.js";

/**
 * The archive `gup log export` writes for a bug report: the debug log of the
 * last days, a description of the machine and, unless left out, a summary of
 * the period's activity — nothing else (no history events, no settings file,
 * no environment beyond an allowlist).
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
  history: "history-summary.json",
  logs: "logs",
} as const;

/**
 * The activity summary of the archive: the period's insights as JSON data
 * (already redacted by the caller), or why the history could not be read.
 */
export type DiagnosticHistory = { readonly summary: unknown } | { readonly unreadable: string };

/** What an archive holds, for its README. */
export interface DiagnosticContents {
  readonly generatedAt: Date;
  readonly system: SystemSnapshot;
  /** The log files copied, by name. */
  readonly logs: readonly string[];
  /** Log lines left out because they were not well-formed records. */
  readonly dropped: number;
  /** Absent when the summary was left out on request. */
  readonly history?: DiagnosticHistory;
}

export interface DiagnosticInput {
  readonly generatedAt: Date;
  readonly system: SystemSnapshot;
  readonly logs: readonly DiagnosticLog[];
  readonly history?: DiagnosticHistory;
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
  addJson(zip, DIAGNOSTIC_ENTRIES.system, sanitizeData(input.system) ?? {});
  const { generatedAt } = input;
  const history = input.history && redactedHistory(input.history);
  if (history !== undefined && "summary" in history) {
    addJson(zip, DIAGNOSTIC_ENTRIES.history, history.summary);
  }
  const contents = { generatedAt, system: input.system, logs: included, ...totals };
  const readme = input.readme({ ...contents, ...(history !== undefined && { history }) });
  zip.addFile(DIAGNOSTIC_ENTRIES.readme, Buffer.from(readme, "utf8"));
  return { zip: zip.toBuffer(), ...totals };
}

/** The reason a history could not be read names its path: shortened like everything else. */
function redactedHistory(history: DiagnosticHistory): DiagnosticHistory {
  return "unreadable" in history ? { unreadable: redactText(history.unreadable) } : history;
}

function addJson(zip: AdmZip, name: string, value: unknown): void {
  zip.addFile(name, Buffer.from(`${JSON.stringify(value, null, JSON_INDENT)}\n`, "utf8"));
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
