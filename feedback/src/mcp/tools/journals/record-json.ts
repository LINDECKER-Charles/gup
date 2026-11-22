import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import type {
  RunEntry, StoredHistoryRecord, StoredLogRecord,
} from "../../../ports/install-reader.js";

function levelName(rank: number): string {
  return JOURNAL_VOCABULARY.logLevels[rank] ?? `level-${rank}`;
}

function history(record: StoredHistoryRecord) {
  return {
    source: "history" as const,
    id: record.id, ts: record.ts.toISOString(), runId: record.runId,
    kind: record.kind, status: record.status, data: record.data,
  };
}

function log(record: StoredLogRecord) {
  return {
    source: "log" as const,
    id: record.id, ts: record.ts.toISOString(), runId: record.runId,
    level: levelName(record.levelRank), event: record.event, data: record.data,
  };
}

/** `ts [label] run=… {data}`: the whole record on one line, the data as compact JSON. */
function line(record: StoredHistoryRecord | StoredLogRecord, label: string): string {
  return `${record.ts.toISOString()} [${label}] run=${record.runId} ${JSON.stringify(record.data)}`;
}

function historyLine(record: StoredHistoryRecord): string {
  return line(record, record.status === null ? record.kind : `${record.kind} ${record.status}`);
}

function logLine(record: StoredLogRecord): string {
  return line(record, `${levelName(record.levelRank)} ${record.event}`);
}

/** Journal records as tools return them: full `data`, ISO 8601 dates, level names. */
export const RECORD_JSON = {
  history,
  log,
  entry: (entry: RunEntry) =>
    entry.source === "history" ? history(entry.record) : log(entry.record),
  historyLine,
  logLine,
  entryLine: (entry: RunEntry): string =>
    entry.source === "history" ? historyLine(entry.record) : logLine(entry.record),
} as const;
