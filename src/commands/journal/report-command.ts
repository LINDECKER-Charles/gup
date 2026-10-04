import { pathToFileURL } from "node:url";
import chalk from "chalk";
import type { Command } from "commander";
import type { CsvDelimiter } from "../../core/export/csv.js";
import type { OpenResult } from "../../core/export/open-external.js";
import { OutputExistsError } from "../../core/export/output-file.js";
import { MAX_REPORT_UPDATES } from "../../core/export/report-model.js";
import { parsePeriod, parseUntil, withUntil, type Period } from "../../core/time/period.js";
import { settingsService } from "../../ui/settings/settings-service.js";
import { resolveGlyphMode, type GlyphPreference } from "../../ui/theme/glyphs.js";
import { ERROR_LABELS } from "../../ui/text/cli-labels.js";
import { periodLabel } from "../../ui/text/journal/activity-labels.js";
import { LOG_MESSAGES } from "../../ui/text/journal/log-labels.js";
import { REPORT_COMMAND_LABELS, REPORT_MESSAGES } from "../../ui/text/journal/report-labels.js";
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
 * `gup report`: the activity history of a period as an HTML report (the
 * default: written to the reports directory and opened in the browser),
 * terminal charts (`text`), a JSON document or a CSV of the update attempts.
 * Data formats go to standard output unless `--out` names a file; data goes
 * to stdout and notices to stderr, so `gup report -f csv > maj.csv` stays
 * clean. Two settings apply when no option says otherwise: whether the HTML
 * report opens, and the symbols the text charts draw with.
 */

export interface ReportOptions {
  readonly format?: string;
  readonly since?: string;
  readonly until?: string;
  readonly out?: string;
  readonly force?: boolean;
  readonly delimiter?: string;
  /** `--open` sets it to true, `--no-open` to false; absent, the setting decides. */
  readonly open?: boolean;
}

/** What the user's settings decide for `gup report` when no option does. */
export interface ReportPreferences {
  /** `interface.glyphs`: the symbols of the `text` format's charts. */
  readonly glyphs: GlyphPreference;
  /** `journal.openReport`: open the HTML report written to a file in the browser. */
  readonly openReport: boolean;
}

/** When the report is asked for, and what the settings say. */
export interface ReportContext {
  readonly now: Date;
  readonly preferences: ReportPreferences;
}

const DEFAULT_FORMAT: HistoryFormat = "html";
/** Formats written to the reports directory, not to stdout, when `--out` is absent. */
const FILE_FORMATS: ReadonlySet<HistoryFormat> = new Set(["html"]);
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
    // Both forms: a lone `--no-open` would make commander default the value
    // to true; with `--open` declared too it stays undefined when neither is
    // given, so the setting can decide.
    .option("--open", REPORT_COMMAND_LABELS.open)
    .option("--no-open", REPORT_COMMAND_LABELS.noOpen)
    .option("--force", REPORT_COMMAND_LABELS.force)
    .option("--delimiter <séparateur>", REPORT_COMMAND_LABELS.delimiter)
    .action(async (options: ReportOptions) => process.exit(await runReport(options)));
}

/** The exit code: 0 written, 1 read or write failure, 2 bad options. */
export async function runReport(
  options: ReportOptions,
  deps: Partial<ExportDeps> = {},
  preferences: ReportPreferences = settingsPreferences(),
): Promise<number> {
  const request = reportRequestOf(options, { now: deps.now?.() ?? new Date(), preferences });
  if (typeof request === "string") return fail(request, USAGE_EXIT_CODE);
  try {
    printOutcome(await exportHistory(request, deps), request);
    return 0;
  } catch (error) {
    return fail(failureMessage(error), FAILURE_EXIT_CODE);
  }
}

/** The request the options describe, or the message saying which one is wrong. */
export function reportRequestOf(
  options: ReportOptions,
  { now, preferences }: ReportContext,
): HistoryExportRequest | string {
  const format = (options.format ?? DEFAULT_FORMAT).trim().toLowerCase();
  if (!isHistoryFormat(format)) return REPORT_MESSAGES.badFormat(options.format ?? "");
  const period = periodOf(options, now);
  if (typeof period === "string") return period;
  const delimiter = delimiterOf(options.delimiter);
  if (delimiter === null) return REPORT_MESSAGES.badDelimiter(options.delimiter ?? "");
  const target = targetOf(options, format);
  return {
    format,
    period,
    target,
    delimiter,
    width: Math.max(MIN_TEXT_WIDTH, process.stdout.columns ?? DEFAULT_TEXT_WIDTH),
    glyphMode: resolveGlyphMode(preferences.glyphs),
    open: opensBrowser(options, { format, target }, preferences),
  };
}

/** The process-wide settings, read when `gup report` runs. */
function settingsPreferences(): ReportPreferences {
  const settings = settingsService();
  return {
    glyphs: settings.get("interface").glyphs,
    openReport: settings.get("journal").openReport,
  };
}

/**
 * Whether the HTML report written to a file opens in the browser: `--open`
 * or `--no-open` decide; otherwise the setting does, as long as somebody is
 * there to see it (a terminal, outside CI).
 */
function opensBrowser(
  options: ReportOptions,
  report: Pick<HistoryExportRequest, "format" | "target">,
  preferences: ReportPreferences,
): boolean {
  if (report.format !== "html" || report.target.kind !== "file") return false;
  if (options.open !== undefined) return options.open;
  const isWatched = process.stdout.isTTY === true && (process.env["CI"] ?? "") === "";
  return preferences.openReport && isWatched;
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

function targetOf({ out, force }: ReportOptions, format: HistoryFormat): ExportTarget {
  if (out === STDOUT_OUT) return { kind: "stdout" };
  if (out === undefined) return FILE_FORMATS.has(format) ? { kind: "file" } : { kind: "stdout" };
  return { kind: "file", out, ...(force === true && { force: true }) };
}

/** Notices on stderr (stdout may be the data), the file written on stdout. */
function printOutcome(result: HistoryExportResult, request: HistoryExportRequest): void {
  for (const notice of noticesOf(result, request.period)) {
    process.stderr.write(`${chalk.dim(notice)}\n`);
  }
  if (result.path === null) return;
  if (request.format === "html") printReportLocation(result.path, result.opened);
  else process.stdout.write(`${REPORT_MESSAGES.written(result.path, result.records)}\n`);
}

function noticesOf({ read, truncated }: HistoryExportResult, period: Period): string[] {
  return [
    ...(read.stats.malformed > 0 ? [REPORT_MESSAGES.malformed(read.stats.malformed)] : []),
    ...(read.stats.unsupported > 0 ? [REPORT_MESSAGES.unsupported(read.stats.unsupported)] : []),
    ...(read.events.length === 0 ? [REPORT_MESSAGES.empty(periodLabel(period))] : []),
    ...(truncated > 0 ? [REPORT_MESSAGES.truncated(MAX_REPORT_UPDATES)] : []),
  ];
}

/** Where the report is; whether it opened, or its address to open it by hand. */
function printReportLocation(path: string, opened: OpenResult | null): void {
  process.stdout.write(`${REPORT_MESSAGES.reportWritten(path)}\n`);
  if (opened?.opened === true) {
    process.stdout.write(`${REPORT_MESSAGES.opened}\n`);
    return;
  }
  if (opened !== null) process.stderr.write(`${openFailure(opened)}\n`);
  process.stdout.write(`${chalk.dim(`  ${pathToFileURL(path).href}`)}\n`);
}

/** A name refused before any launcher (`--out rapport.hta`), or a browser that did not start. */
function openFailure(opened: OpenResult): string {
  return opened.isNotHtml === true ? REPORT_MESSAGES.notHtml : REPORT_MESSAGES.openFailed;
}

function failureMessage(error: unknown): string {
  if (error instanceof OutputExistsError) return LOG_MESSAGES.exists(error.path);
  return LOG_MESSAGES.exportFailed(error instanceof Error ? error.message : String(error));
}

function fail(message: string, code: number): number {
  process.stderr.write(`${chalk.red(ERROR_LABELS.prefix)} ${message}\n`);
  return code;
}
