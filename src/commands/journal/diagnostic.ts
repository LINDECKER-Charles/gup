import chalk from "chalk";
import { readFile } from "node:fs/promises";
import {
  buildDiagnosticZip,
  MAX_DIAGNOSTIC_LOG_BYTES,
  type DiagnosticLog,
} from "../../core/export/diagnostic-bundle.js";
import { OutputExistsError, writeOutputFile } from "../../core/export/output-file.js";
import { utcDay } from "../../core/log/file-sink.js";
import { listLogFiles } from "../../core/log/log-reader.js";
import { stateDir } from "../../core/state/app-dirs.js";
import { systemSnapshot } from "../../core/state/system-snapshot.js";
import { LOG_MESSAGES } from "../../ui/text/log-labels.js";
import { DEFAULT_SINCE } from "./log-show.js";
import { parseSince } from "./since-option.js";

/**
 * `gup log export`: the diagnostic archive a bug report asks for — the debug
 * log of the last days (newest files first, up to a size bound) and a
 * description of the machine, redacted again, written as a private file in
 * the reports directory or at `--out`. Nothing is uploaded, ever.
 */

export interface ExportOptions {
  readonly since?: string;
  readonly out?: string;
  readonly force?: boolean;
}

const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;

export async function exportDiagnostic(options: ExportOptions): Promise<number> {
  const now = new Date();
  const rawSince = options.since ?? DEFAULT_SINCE;
  const since = parseSince(rawSince, now);
  if (!since.isValid) return fail(LOG_MESSAGES.badSince(rawSince), USAGE_EXIT_CODE);
  try {
    const logs = await collectLogs(stateDir("logs"), since.since);
    const archive = buildDiagnosticZip({ generatedAt: now, system: systemSnapshot(), logs });
    const path = await writeOutputFile({
      kind: "diagnostic",
      extension: "zip",
      content: archive.zip,
      now,
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
  process.stderr.write(`${chalk.red("Error:")} ${message}\n`);
  return code;
}
