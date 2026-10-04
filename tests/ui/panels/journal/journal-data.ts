import { vi } from "vitest";
import { buildInsights } from "../../../../src/core/insights/build-insights.js";
import type { HistoryEvent } from "../../../../src/core/history/types.js";
import type { LogRecord } from "../../../../src/core/log/types.js";
import { parsePeriod, type Period } from "../../../../src/core/time/period.js";
import type {
  ExportOutcome,
  JournalData,
  JournalHistory,
  JournalLog,
  JournalSource,
} from "../../../../src/ui/panels/journal/journal-source.js";
import { scanEvent, updateEvent } from "../../../support/history-fixtures.js";

/**
 * Journal data and a scripted source for the journal view's suites: the
 * insights are the real ones, built from fixture events.
 */

/** The journal's "now" in these suites (TZ=UTC in the test environment). */
export const JOURNAL_NOW = new Date("2026-10-03T12:00:00.000Z");

const daysAgo = (days: number) => new Date(JOURNAL_NOW.getTime() - days * 86_400_000).toISOString();

/** A small but complete period: updates of every outcome, two full scans. */
export const SAMPLE_EVENTS: readonly HistoryEvent[] = [
  scanEvent({
    ts: daysAgo(9),
    outdated: 12,
    trigger: "menu",
    providers: [
      { providerId: "winget", outdated: 9, durationMs: 12_400 },
      { providerId: "az", outdated: 0, error: "Please run 'az login'" },
    ],
  }),
  updateEvent("winget", "Google.Chrome", { ts: daysAgo(8), from: "128.0", to: "129.0", trigger: "menu" }),
  updateEvent("winget", "Google.Chrome", { ts: daysAgo(1), from: "129.0", to: "130.0", trigger: "cli" }),
  updateEvent("choco", "nodejs", { ts: daysAgo(3), status: "failed", message: "exit code 1603\nsee the log" }),
  updateEvent("winget", "Spotify.Spotify", { ts: daysAgo(2), status: "skipped", message: "ignorée par l'utilisateur" }),
  updateEvent("npm-g", "typescript", { ts: daysAgo(5), durationMs: 18_400 }),
  scanEvent({
    ts: daysAgo(0.5),
    outdated: 7,
    providers: [{ providerId: "winget", outdated: 7, durationMs: 9_000 }],
  }),
];

export function logRecord(over: Partial<LogRecord>): LogRecord {
  return {
    v: 1,
    ts: "2026-10-03T11:00:00.000Z",
    level: "info",
    event: "session.start",
    runId: "run-1",
    pid: 42,
    ...over,
  };
}

export const SAMPLE_RECORDS: readonly LogRecord[] = [
  logRecord({ ts: "2026-10-03T11:00:03.000Z", level: "error", event: "session.crash", data: { error: { message: "boom" } } }),
  logRecord({
    ts: "2026-10-03T11:00:02.000Z",
    level: "warn",
    event: "cmd.end",
    ctx: { op: "scan", providerId: "az" },
    data: { cmd: "az", args: ["version"], exitCode: 1, ms: 400 },
  }),
  logRecord({ ts: "2026-10-03T11:00:01.000Z", level: "debug", event: "scan.provider", data: { ms: 900, outdated: 2 } }),
];

export const PERIOD_12M: Period = parsePeriod("12m", JOURNAL_NOW)!;

export function journalData(
  events: readonly HistoryEvent[] = SAMPLE_EVENTS,
  over: { readonly history?: Partial<JournalHistory>; readonly log?: Partial<JournalLog> } = {},
): JournalData {
  const insights = buildInsights(events, { period: PERIOD_12M });
  return {
    history: {
      insights,
      events: [...events].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)),
      stats: { files: 1, lines: events.length, malformed: 0, unsupported: 0 },
      isRecordingOff: false,
      ...over.history,
    },
    log: { records: SAMPLE_RECORDS, threshold: "info", source: "default", malformed: 0, ...over.log },
  };
}

/** A source answering `data` (or each load in turn) and writing every export to `path`. */
export function scriptedSource(
  data: JournalData | readonly JournalData[] = journalData(),
  outcome: ExportOutcome = { ok: true, path: "C:\\reports\\gup-history.json" },
): JournalSource & { load: ReturnType<typeof vi.fn>; export: ReturnType<typeof vi.fn> } {
  const answers: JournalData[] = Array.isArray(data) ? [...(data as readonly JournalData[])] : [data as JournalData];
  return {
    load: vi.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0]!)),
    export: vi.fn(async () => outcome),
  };
}
