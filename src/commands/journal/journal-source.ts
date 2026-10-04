import { readHistory, type HistoryRead } from "../../core/history/reader.js";
import { isHistoryEnabled } from "../../core/history/store.js";
import { buildInsights } from "../../core/insights/build-insights.js";
import { readLogTail } from "../../core/log/log-reader.js";
import { stateDir } from "../../core/state/app-dirs.js";
import type { Period } from "../../core/time/period.js";
import type {
  ExportFormat,
  ExportOutcome,
  JournalData,
  JournalHistory,
  JournalLog,
  JournalSource,
} from "../../ui/panels/journal/journal-source.js";
import { settingsService } from "../../ui/settings/settings-service.js";
import { writeDiagnostic } from "./diagnostic.js";
import { exportHistory } from "./export-history.js";
import { currentLogLevel } from "./log-session.js";

/**
 * The journal view's source: the period's history aggregated, the debug
 * log's newest records and how this run writes it, and the exports — each
 * read independently, a failure turned into data the view shows. Never
 * rejects. A written HTML report opens in the browser when the
 * `journal.openReport` setting says so.
 */

/** Events the Events tab lists, newest first. */
export const MAX_JOURNAL_EVENTS = 10_000;
/** Records the Debug tab lists. */
export const MAX_DEBUG_RECORDS = 500;

export interface JournalSourceDeps {
  readonly readHistory: (period: Period) => Promise<HistoryRead>;
  readonly readLog: typeof readLogTail;
  readonly exportHistory: typeof exportHistory;
  readonly writeDiagnostic: typeof writeDiagnostic;
  /** Whether a written HTML report opens in the browser; read at each export. */
  readonly opensReport: () => boolean;
}

const DEFAULT_DEPS: JournalSourceDeps = {
  readHistory: (period) => readHistory(period),
  readLog: readLogTail,
  exportHistory,
  writeDiagnostic,
  opensReport: () => settingsService().get("journal").openReport,
};

const NO_STATS = { files: 0, lines: 0, malformed: 0, unsupported: 0 };

export function createJournalSource(overrides: Partial<JournalSourceDeps> = {}): JournalSource {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  return {
    load: async (period) => {
      const [history, log] = await Promise.all([loadHistory(period, deps), loadLog(period, deps)]);
      return { history, log } satisfies JournalData;
    },
    export: (format, period) => exportTo(format, period, deps),
  };
}

export const journalSource: JournalSource = createJournalSource();

async function loadHistory(period: Period, deps: JournalSourceDeps): Promise<JournalHistory> {
  const isRecordingOff = !isHistoryEnabled();
  try {
    const read = await deps.readHistory(period);
    const events = read.events.slice(-MAX_JOURNAL_EVENTS).reverse();
    const insights = buildInsights(read.events, { period });
    return { insights, events, stats: read.stats, isRecordingOff };
  } catch (error) {
    const empty = buildInsights([], { period });
    return { insights: empty, events: [], stats: NO_STATS, error: reasonOf(error), isRecordingOff };
  }
}

async function loadLog(period: Period, deps: JournalSourceDeps): Promise<JournalLog> {
  const writing = currentLogLevel();
  try {
    const query = { limit: MAX_DEBUG_RECORDS, since: period.since };
    const tail = await deps.readLog(query, stateDir("logs"));
    return { records: [...tail.records].reverse(), malformed: tail.malformed, ...writing };
  } catch (error) {
    return { records: [], malformed: 0, error: reasonOf(error), ...writing };
  }
}

async function exportTo(
  format: ExportFormat,
  period: Period,
  deps: JournalSourceDeps,
): Promise<ExportOutcome> {
  try {
    return { ok: true, ...(await exportedFile(format, period, deps)) };
  } catch (error) {
    return { ok: false, error: reasonOf(error) };
  }
}

/**
 * The file an export wrote, in the reports directory; the HTML report is
 * opened too when the setting asks for it (`opened` says whether it was).
 */
async function exportedFile(
  format: ExportFormat,
  period: Period,
  deps: JournalSourceDeps,
): Promise<{ readonly path: string; readonly opened?: boolean }> {
  if (format === "diagnostic") {
    return { path: await deps.writeDiagnostic({ period, withHistory: true }) };
  }
  const opens = format === "html" && deps.opensReport();
  const { path, opened } = await deps.exportHistory({
    format,
    period,
    target: { kind: "file" },
    ...(opens && { open: true }),
  });
  if (path === null) throw new TypeError("a file export returned no path");
  return opens ? { path, opened: opened?.opened === true } : { path };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
