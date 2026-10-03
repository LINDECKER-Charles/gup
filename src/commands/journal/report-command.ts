import chalk from "chalk";
import type { Command } from "commander";
import type { CsvDelimiter } from "../../core/export/csv.js";
import { OutputExistsError } from "../../core/export/output-file.js";
import { parsePeriod, parseUntil, withUntil, type Period } from "../../core/time/period.js";
import { resolveGlyphMode } from "../../ui/theme/glyphs.js";
import { periodLabel } from "../../ui/text/activity-labels.js";
import { LOG_MESSAGES } from "../../ui/text/log-labels.js";
import { REPORT_COMMAND_LABELS, REPORT_MESSAGES } from "../../ui/text/report-labels.js";
import {
  exportHistory,
  HISTORY_FORMATS,
  type ExportDeps,
  type ExportTarget,
  type HistoryExportRequest,
  type HistoryExportResult,
  type HistoryFormat,
} from "./export-history.js";

/**
 * `gup report`: the activity history of a period as terminal charts
 * (`text`, the default), a JSON document or a CSV of the update attempts —
 * on standard output, or in the `--out` file. Data goes to stdout and
 * notices to stderr, so `gup report -f csv > maj.csv` stays clean.
 */

export interface ReportOptions {
  readonly format?: string;
  readonly since?: string;
  readonly until?: string;
  readonly out?: string;
  readonly force?: boolean;
  readonly delimiter?: string;
}

const DEFAULT_FORMAT: HistoryFormat = "text";
const DEFAULT_SINCE = "12m";
/** `--out -`: standard output, explicitly. */
const STDOUT_OUT = "-";
const DELIMITERS: Readonly<Record<string, CsvDelimiter>> = { ",": ",", ";": ";", tab: "\t" };
const DEFAULT_TEXT_WIDTH = 100;
const MIN_TEXT_WIDTH = 40;
const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description(REPORT_COMMAND_LABELS.report)
    .option("-f, --format <format>", REPORT_COMMAND_LABELS.format)
    .option("-s, --since <période>", REPORT_COMMAND_LABELS.since)
    .option("--until <date>", REPORT_COMMAND_LABELS.until)
    .option("-o, --out <fichier>", REPORT_COMMAND_LABELS.out)
    .option("--force", REPORT_COMMAND_LABELS.force)
    .option("--delimiter <séparateur>", REPORT_COMMAND_LABELS.delimiter)
    .action(async (options: ReportOptions) => process.exit(await runReport(options)));
}

/** The exit code: 0 written, 1 read or write failure, 2 bad options. */
export async function runReport(
  options: ReportOptions,
  deps: Partial<ExportDeps> = {},
): Promise<number> {
  const request = reportRequestOf(options, deps.now?.() ?? new Date());
  if (typeof request === "string") return fail(request, USAGE_EXIT_CODE);
  try {
    printOutcome(await exportHistory(request, deps), request.period);
    return 0;
  } catch (error) {
    return fail(failureMessage(error), FAILURE_EXIT_CODE);
  }
}

/** The request the options describe, or the message saying which one is wrong. */
export function reportRequestOf(options: ReportOptions, now: Date): HistoryExportRequest | string {
  const format = (options.format ?? DEFAULT_FORMAT).trim().toLowerCase();
  if (!isHistoryFormat(format)) return REPORT_MESSAGES.badFormat(options.format ?? "");
  const period = periodOf(options, now);
  if (typeof period === "string") return period;
  const delimiter = delimiterOf(options.delimiter);
  if (delimiter === null) return REPORT_MESSAGES.badDelimiter(options.delimiter ?? "");
  return {
    format,
    period,
    target: targetOf(options),
    delimiter,
    width: Math.max(MIN_TEXT_WIDTH, process.stdout.columns ?? DEFAULT_TEXT_WIDTH),
    glyphMode: resolveGlyphMode("auto"),
  };
}

function isHistoryFormat(value: string): value is HistoryFormat {
  return (HISTORY_FORMATS as readonly string[]).includes(value);
}

function periodOf(options: ReportOptions, now: Date): Period | string {
  const rawSince = options.since ?? DEFAULT_SINCE;
  const period = parsePeriod(rawSince, now);
  if (period === null) return REPORT_MESSAGES.badSince(rawSince);
  if (options.until === undefined) return period;
  const until = parseUntil(options.until);
  if (until === null) return REPORT_MESSAGES.badUntil(options.until);
  return withUntil(period, until) ?? REPORT_MESSAGES.untilBeforeSince;
}

/** `,` by default; null when the value is not one of the three separators. */
function delimiterOf(raw: string | undefined): CsvDelimiter | null {
  if (raw === undefined) return ",";
  const key = raw.trim().toLowerCase();
  return Object.hasOwn(DELIMITERS, key) ? (DELIMITERS[key] ?? null) : null;
}

function targetOf({ out, force }: ReportOptions): ExportTarget {
  if (out === undefined || out === STDOUT_OUT) return { kind: "stdout" };
  return { kind: "file", out, ...(force === true && { force: true }) };
}

/** Notices on stderr (stdout may be the data), the file written on stdout. */
function printOutcome({ path, events, read }: HistoryExportResult, period: Period): void {
  const notices = [
    ...(read.stats.malformed > 0 ? [REPORT_MESSAGES.malformed(read.stats.malformed)] : []),
    ...(read.stats.unsupported > 0 ? [REPORT_MESSAGES.unsupported(read.stats.unsupported)] : []),
    ...(events === 0 ? [REPORT_MESSAGES.empty(periodLabel(period))] : []),
  ];
  for (const notice of notices) process.stderr.write(`${chalk.dim(notice)}\n`);
  if (path !== null) process.stdout.write(`${REPORT_MESSAGES.written(path, events)}\n`);
}

function failureMessage(error: unknown): string {
  if (error instanceof OutputExistsError) return LOG_MESSAGES.exists(error.path);
  return LOG_MESSAGES.exportFailed(error instanceof Error ? error.message : String(error));
}

function fail(message: string, code: number): number {
  process.stderr.write(`${chalk.red("Error:")} ${message}\n`);
  return code;
}
