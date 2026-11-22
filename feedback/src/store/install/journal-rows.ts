import type { HistoryKind } from "../../domain/journal.js";
import type {
  InstallSummary, RunEntry, StoredHistoryRecord, StoredLogRecord, StoredRecord,
} from "../../ports/install-reader.js";
import type { Page, PageRequest } from "../../ports/page.js";

export interface SummaryRow {
  id: string;
  gup_version: string | null;
  platform: string | null;
  arch: string | null;
  node_version: string | null;
  locale: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  history_count: number;
  log_count: number;
  feedback_count: number;
}

interface RecordRow {
  /** bigint: pg returns it as a string. */
  id: string;
  ts: Date;
  run_id: string;
  data: Record<string, unknown>;
}

export interface HistoryRow extends RecordRow {
  kind: HistoryKind;
  status: string | null;
}

export interface LogRow extends RecordRow {
  level_rank: number;
  event: string;
}

/** A row of the run query: both tables' columns, the other side's left null. */
export interface RunRow extends RecordRow {
  source: RunEntry["source"];
  kind: HistoryKind | null;
  status: string | null;
  level_rank: number | null;
  event: string | null;
}

export interface Paged {
  total: number;
}

export function toSummary(row: SummaryRow): InstallSummary {
  return {
    id: row.id, gupVersion: row.gup_version, platform: row.platform, arch: row.arch,
    node: row.node_version, locale: row.locale, firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at, historyCount: row.history_count, logCount: row.log_count,
    feedbackCount: row.feedback_count,
  };
}

function toRecord(row: RecordRow): StoredRecord {
  return { id: Number(row.id), ts: row.ts, runId: row.run_id, data: row.data };
}

export function toHistory(row: HistoryRow): StoredHistoryRecord {
  return { ...toRecord(row), kind: row.kind, status: row.status };
}

export function toLog(row: LogRow): StoredLogRecord {
  return { ...toRecord(row), levelRank: row.level_rank, event: row.event };
}

export function toRunEntry(row: RunRow): RunEntry {
  if (row.source === "history") {
    return { source: "history", record: toHistory({ ...row, kind: row.kind ?? "update" }) };
  }
  return {
    source: "log",
    record: toLog({ ...row, level_rank: row.level_rank ?? 0, event: row.event ?? "" }),
  };
}

export function offsetOf(request: PageRequest): number {
  return (request.page - 1) * request.pageSize;
}

/**
 * Wraps the rows of a page query that also selected `count(*) OVER () AS total`.
 * A page past the end has no row to carry the total: it reads as empty, which
 * is what the back office shows for it anyway.
 */
export function toPage<R extends Paged, T>(
  rows: readonly R[], request: PageRequest, map: (row: R) => T,
): Page<T> {
  const { page, pageSize } = request;
  return { items: rows.map(map), total: rows[0]?.total ?? 0, page, pageSize };
}
