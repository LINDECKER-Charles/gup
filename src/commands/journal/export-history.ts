import { updatesToCsv, type CsvDelimiter } from "../../core/export/csv.js";
import { toJsonExport } from "../../core/export/json-export.js";
import {
  writeOutputFile,
  type OutputExtension,
  type OutputKind,
} from "../../core/export/output-file.js";
import { readHistory, type HistoryRead } from "../../core/history/reader.js";
import { buildInsights } from "../../core/insights/build-insights.js";
import type { Insights } from "../../core/insights/types.js";
import { log } from "../../core/log/log.js";
import { getProvider } from "../../core/registry.js";
import type { Period } from "../../core/time/period.js";
import { gupVersion } from "../../core/version.js";
import { linesToAnsi, linesToText } from "../../ui/charts/ansi-lines.js";
import { chartGlyphs } from "../../ui/charts/chart-glyphs.js";
import { renderTextReport } from "../../ui/charts/text-report.js";
import type { GlyphMode } from "../../ui/theme/glyphs.js";

/**
 * The history of a period exported: read, aggregated, serialised by format,
 * then written to standard output or to a file (the user's `--out`, or a
 * dated name in the reports directory). Shared by `gup report` and the
 * journal view's export. Adding a format is one entry of {@link SERIALIZERS}.
 */

export type HistoryFormat = "json" | "csv" | "text";
export const HISTORY_FORMATS: readonly HistoryFormat[] = ["json", "csv", "text"];

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
}

export interface HistoryExportResult {
  /** The file written; null on standard output. */
  readonly path: string | null;
  readonly bytes: number;
  /** Records the export holds: every event, or every update attempt for a CSV. */
  readonly records: number;
  readonly read: HistoryRead;
}

export interface ExportDeps {
  readonly readHistory: typeof readHistory;
  readonly writeOutputFile: typeof writeOutputFile;
  readonly stdout: (text: string) => void;
  readonly now: () => Date;
  readonly nameOf: (providerId: string) => string;
}

const DEFAULT_TEXT_WIDTH = 100;

const DEFAULT_DEPS: ExportDeps = {
  readHistory,
  writeOutputFile,
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
}

const everyEvent = (read: HistoryRead): number => read.events.length;
const updatesOnly = (read: HistoryRead): number =>
  read.events.filter((event) => event.kind === "update").length;

const SERIALIZERS: Readonly<Record<HistoryFormat, Serializer>> = {
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
  return { path, bytes, records, read };
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

function serializeJson({ request, read, insights, deps }: SerializeInput): string {
  return toJsonExport({
    meta: {
      generatedAt: deps.now(),
      gup: gupVersion(),
      platform: process.platform,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
  };
  const lines = renderTextReport(insights, context);
  return request.target.kind === "stdout" ? linesToAnsi(lines, mode) : linesToText(lines, mode);
}
