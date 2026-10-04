import { updatesToCsv, type CsvDelimiter } from "../../core/export/csv.js";
import { toJsonExport } from "../../core/export/json-export.js";
import { openExternal, type OpenResult } from "../../core/export/open-external.js";
import {
  writeOutputFile,
  type OutputExtension,
  type OutputKind,
} from "../../core/export/output-file.js";
import { buildReportModel, MAX_REPORT_UPDATES } from "../../core/export/report-model.js";
import { readHistory, type HistoryRead } from "../../core/history/reader.js";
import { buildInsights } from "../../core/insights/build-insights.js";
import type { Insights } from "../../core/insights/types.js";
import { log } from "../../core/log/log.js";
import { getProvider } from "../../core/registry.js";
import type { Period } from "../../core/time/period.js";
import { gupVersion } from "../../core/version.js";
import { renderReportHtml } from "../../report/render-report.js";
import { linesToAnsi, linesToText } from "../../ui/charts/ansi-lines.js";
import { chartGlyphs } from "../../ui/charts/chart-glyphs.js";
import { renderTextReport } from "../../ui/charts/text-report.js";
import { periodLabel, periodLead } from "../../ui/text/journal/activity-labels.js";
import type { GlyphMode } from "../../ui/theme/glyphs.js";

/**
 * The history of a period exported: read, aggregated, serialised by format,
 * then written to standard output or to a file (the user's `--out`, or a
 * dated name in the reports directory), and opened with the user's default
 * application when asked (the HTML report: the browser). Shared by `gup
 * report` and the journal view's export. Adding a format is one entry of
 * {@link SERIALIZERS}.
 */

export type HistoryFormat = "html" | "json" | "csv" | "text";
export const HISTORY_FORMATS: readonly HistoryFormat[] = ["html", "json", "csv", "text"];

export type ExportTarget =
  | { readonly kind: "stdout" }
  /** `out` absent: a dated name in the reports directory. */
  | { readonly kind: "file"; readonly out?: string; readonly force?: boolean };

export interface HistoryExportRequest {
  readonly format: HistoryFormat;
  readonly period: Period;
  readonly target: ExportTarget;
  readonly delimiter?: CsvDelimiter;
  /** Columns of the text report. */
  readonly width?: number;
  readonly glyphMode?: GlyphMode;
  /** Open the file written with the default application (the HTML report: the browser). */
  readonly open?: boolean;
}

export interface HistoryExportResult {
  /** The file written; null on standard output. */
  readonly path: string | null;
  readonly bytes: number;
  /** Records the export holds: every event, or every update attempt for a CSV. */
  readonly records: number;
  readonly read: HistoryRead;
  /** Update attempts the HTML report counts but does not detail (its cap); 0 otherwise. */
  readonly truncated: number;
  /** How opening the file went; null when it was not asked for or nothing was written. */
  readonly opened: OpenResult | null;
}

export interface ExportDeps {
  readonly readHistory: typeof readHistory;
  readonly writeOutputFile: typeof writeOutputFile;
  readonly openExternal: (file: string) => Promise<OpenResult>;
  readonly stdout: (text: string) => void;
  readonly now: () => Date;
  readonly nameOf: (providerId: string) => string;
}

const DEFAULT_TEXT_WIDTH = 100;

const DEFAULT_DEPS: ExportDeps = {
  readHistory,
  writeOutputFile,
  openExternal: (file) => openExternal(file),
  stdout: (text) => void process.stdout.write(text),
  now: () => new Date(),
  nameOf: (providerId) => getProvider(providerId)?.displayName ?? providerId,
};

interface SerializeInput {
  readonly request: HistoryExportRequest;
  readonly read: HistoryRead;
  readonly insights: Insights;
  readonly deps: ExportDeps;
}

interface Serializer {
  readonly kind: OutputKind;
  readonly extension: OutputExtension;
  serialize(input: SerializeInput): string;
  /** How many records of `read` the output holds. */
  records(read: HistoryRead): number;
  /** How many update attempts of `read` the output leaves out. */
  truncated?(read: HistoryRead): number;
}

const everyEvent = (read: HistoryRead): number => read.events.length;
const updatesOnly = (read: HistoryRead): number =>
  read.events.filter((event) => event.kind === "update").length;
const beyondReportCap = (read: HistoryRead): number =>
  Math.max(0, updatesOnly(read) - MAX_REPORT_UPDATES);

const SERIALIZERS: Readonly<Record<HistoryFormat, Serializer>> = {
  html: {
    kind: "report",
    extension: "html",
    serialize: serializeHtml,
    records: everyEvent,
    truncated: beyondReportCap,
  },
  json: { kind: "history", extension: "json", serialize: serializeJson, records: everyEvent },
  csv: { kind: "history", extension: "csv", serialize: serializeCsv, records: updatesOnly },
  text: { kind: "report", extension: "txt", serialize: serializeText, records: everyEvent },
};

/** Never partial: a read or write failure rejects, and nothing is reported as written. */
export async function exportHistory(
  request: HistoryExportRequest,
  overrides: Partial<ExportDeps> = {},
): Promise<HistoryExportResult> {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const read = await deps.readHistory(request.period);
  const insights = buildInsights(read.events, { period: request.period });
  const serializer = SERIALIZERS[request.format];
  const content = serializer.serialize({ request, read, insights, deps });
  const path = await deliver(content, serializer, { request, deps });
  const bytes = Buffer.byteLength(content);
  const records = serializer.records(read);
  log.info("report.export", { format: request.format, records, bytes, path });
  const opened = request.open === true && path !== null ? await openWritten(path, deps) : null;
  return { path, bytes, records, read, truncated: serializer.truncated?.(read) ?? 0, opened };
}

/** Never rejects: a file that could not be opened is still written. */
async function openWritten(path: string, deps: ExportDeps): Promise<OpenResult> {
  const result = await deps.openExternal(path);
  const { opened, launcher, reason } = result;
  log.info("report.open", { opened, launcher, ...(reason !== undefined && { reason }) });
  return result;
}

async function deliver(
  content: string,
  serializer: Serializer,
  { request, deps }: Pick<SerializeInput, "request" | "deps">,
): Promise<string | null> {
  const { target } = request;
  if (target.kind === "stdout") {
    deps.stdout(content);
    return null;
  }
  return deps.writeOutputFile({
    kind: serializer.kind,
    extension: serializer.extension,
    content,
    now: deps.now(),
    ...(target.out !== undefined && { out: target.out }),
    ...(target.force === true && { force: true }),
  });
}

/** The self-contained HTML report: its data model, rendered with its script and styles. */
function serializeHtml({ request, read, insights, deps }: SerializeInput): string {
  const { period } = request;
  const model = buildReportModel({
    events: read.events,
    insights,
    stats: read.stats,
    context: {
      now: deps.now(),
      nameOf: deps.nameOf,
      period: { label: periodLabel(period), lead: periodLead(period) },
      gup: gupVersion(),
      platform: process.platform,
      timeZone: localTimeZone(),
    },
  });
  return renderReportHtml(model);
}

function serializeJson({ request, read, insights, deps }: SerializeInput): string {
  return toJsonExport({
    meta: {
      generatedAt: deps.now(),
      gup: gupVersion(),
      platform: process.platform,
      timeZone: localTimeZone(),
      period: request.period,
      stats: read.stats,
    },
    insights,
    events: read.events,
  });
}

function serializeCsv({ request, read, deps }: SerializeInput): string {
  return updatesToCsv(read.events, { delimiter: request.delimiter ?? ",", nameOf: deps.nameOf });
}

/** Charts, painted for a terminal on standard output, plain in a file. */
function serializeText({ request, insights, deps }: SerializeInput): string {
  const mode = request.glyphMode ?? "unicode";
  const context = {
    width: request.width ?? DEFAULT_TEXT_WIDTH,
    glyphs: chartGlyphs(mode),
    now: deps.now(),
    providerName: deps.nameOf,
  };
  const lines = renderTextReport(insights, context);
  return request.target.kind === "stdout" ? linesToAnsi(lines, mode) : linesToText(lines, mode);
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
