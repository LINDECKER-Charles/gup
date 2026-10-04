import chalk from "chalk";
import { readFile } from "node:fs/promises";
import {
  buildDiagnosticZip,
  MAX_DIAGNOSTIC_LOG_BYTES,
  type DiagnosticHistory,
  type DiagnosticLog,
} from "../../core/export/diagnostic-bundle.js";
import { insightsDocument } from "../../core/export/json-export.js";
import { OutputExistsError, writeOutputFile } from "../../core/export/output-file.js";
import { readHistory } from "../../core/history/reader.js";
import { buildInsights } from "../../core/insights/build-insights.js";
import { utcDay } from "../../core/log/file-sink.js";
import { listLogFiles } from "../../core/log/log-reader.js";
import { stateDir } from "../../core/state/app-dirs.js";
import { systemSnapshot } from "../../core/state/system-snapshot.js";
import { parsePeriod, type Period } from "../../core/time/period.js";
import { ERROR_LABELS } from "../../ui/text/cli-labels.js";
import { diagnosticReadme, LOG_MESSAGES } from "../../ui/text/journal/log-labels.js";
import { DEFAULT_SINCE } from "./log-show.js";

/**
 * `gup log export`: the diagnostic archive a bug report asks for — the debug
 * log of the period (newest files first, up to a size bound), a description
 * of the machine and a summary of the period's activity (`--no-history`
 * leaves it out), redacted again, written as a private file in the reports
 * directory or at `--out`. Nothing is uploaded, ever. The journal view writes
 * the same archive.
 */

export interface ExportOptions {
  readonly since?: string;
  readonly out?: string;
  readonly force?: boolean;
  /** False under `--no-history`. */
  readonly history?: boolean;
}

export interface DiagnosticRequest {
  readonly period: Period;
  readonly withHistory: boolean;
  readonly out?: string;
  readonly force?: boolean;
}

const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;

export async function exportDiagnostic(options: ExportOptions): Promise<number> {
  const rawSince = options.since ?? DEFAULT_SINCE;
  const period = parsePeriod(rawSince, new Date());
  if (period === null) return fail(LOG_MESSAGES.badSince(rawSince), USAGE_EXIT_CODE);
  try {
    const path = await writeDiagnostic({
      period,
      withHistory: options.history !== false,
      ...(options.out !== undefined && { out: options.out }),
      ...(options.force === true && { force: true }),
    });
    process.stdout.write(`${LOG_MESSAGES.archiveWritten(path)}\n`);
    process.stdout.write(`${chalk.dim(LOG_MESSAGES.archiveReview)}\n`);
    return 0;
  } catch (error) {
    return fail(failureMessage(error), FAILURE_EXIT_CODE);
  }
}

/** Build and write the archive; resolves with its path. Rejects only when it cannot be written. */
export async function writeDiagnostic(request: DiagnosticRequest): Promise<string> {
  const { period } = request;
  const now = new Date();
  const logs = await collectLogs(stateDir("logs"), period.since);
  const history = request.withHistory ? await historySummary(period) : undefined;
  const archive = buildDiagnosticZip({
    generatedAt: now,
    system: systemSnapshot(),
    logs,
    readme: diagnosticReadme,
    ...(history !== undefined && { history }),
  });
  return writeOutputFile({
    kind: "diagnostic",
    extension: "zip",
    content: archive.zip,
    now,
    ...(request.out !== undefined && { out: request.out }),
    ...(request.force === true && { force: true }),
  });
}

/**
 * The period's insights, never its raw events. A history that cannot be read
 * does not cost the archive: the README says why the summary is missing.
 */
async function historySummary(period: Period): Promise<DiagnosticHistory> {
  try {
    const read = await readHistory(period);
    return { summary: insightsDocument(buildInsights(read.events, { period })) };
  } catch (error) {
    return { unreadable: error instanceof Error ? error.message : String(error) };
  }
}

function failureMessage(error: unknown): string {
  if (error instanceof OutputExistsError) return LOG_MESSAGES.exists(error.path);
  return LOG_MESSAGES.exportFailed(error instanceof Error ? error.message : String(error));
}

/** The log files from `since` on, newest first, as long as they fit the archive's bound. */
async function collectLogs(dir: string | null, since: Date | null): Promise<DiagnosticLog[]> {
  if (dir === null) return [];
  const oldestDay = since ? utcDay(since) : null;
  const logs: DiagnosticLog[] = [];
  let remainingBytes = MAX_DIAGNOSTIC_LOG_BYTES;
  for (const file of await listLogFiles(dir)) {
    if ((oldestDay !== null && file.day < oldestDay) || file.bytes > remainingBytes) break;
    remainingBytes -= file.bytes;
    logs.push({ name: file.name, content: await readFile(file.path, "utf8") });
  }
  return logs;
}

function fail(message: string, code: number): number {
  process.stderr.write(`${chalk.red(ERROR_LABELS.prefix)} ${message}\n`);
  return code;
}
