import type { Pool, QueryResultRow } from "pg";
import type {
  HistoryBreakdownCell, HistoryQuery, InstallReader, InstallSummary, JournalSpan, LogQuery,
  RunEntry, RunKey, RunQuery, RunSummary, StoredHistoryRecord, StoredLogRecord,
} from "../ports/install-reader.js";
import type { Page, PageRequest } from "../ports/page.js";
import {
  offsetOf, toHistory, toLog, toPage, toRunEntry, toSummary,
  type HistoryRow, type LogRow, type Paged, type RunRow, type SummaryRow,
} from "./install/journal-rows.js";
import {
  HISTORY_BREAKDOWN, HISTORY_CHUNK, HISTORY_PAGE, INSTALL_SUMMARY, JOURNAL_SPAN, LOG_CHUNK,
  LOG_PAGE, RUN_PAGE, RUN_SUMMARY,
} from "./install/journal-sql.js";
import { likePattern } from "./like-pattern.js";

/** Rows per round trip of an export: a few MiB at most, whatever the install holds. */
const EXPORT_CHUNK_ROWS = 1000;

interface SpanRow {
  oldest_at: Date | null;
  newest_at: Date | null;
  oldest_received_at: Date | null;
  run_count: number;
}

interface RunSummaryRow {
  started_at: Date | null;
  ended_at: Date | null;
  history_count: number;
  log_count: number;
  error_count: number;
  failed_update_count: number;
}

interface ChunkCursor {
  id: string;
  ts_cursor: string;
}

function toRunSummary(key: RunKey, row: RunSummaryRow | undefined): RunSummary | null {
  if (row?.started_at == null || row.ended_at === null) return null;
  return {
    ...key, startedAt: row.started_at, endedAt: row.ended_at,
    historyCount: row.history_count, logCount: row.log_count, errorCount: row.error_count,
    failedUpdateCount: row.failed_update_count,
  };
}

export class PgInstallReader implements InstallReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async list(request: PageRequest): Promise<Page<InstallSummary>> {
    const { rows } = await this.#pool.query<SummaryRow & Paged>(
      `SELECT s.*, count(*) OVER ()::int AS total FROM (${INSTALL_SUMMARY}) s
       ORDER BY s.last_seen_at DESC, s.id LIMIT $1 OFFSET $2`,
      [request.pageSize, offsetOf(request)]);
    return toPage(rows, request, toSummary);
  }

  async find(installId: string): Promise<InstallSummary | null> {
    const { rows } = await this.#pool.query<SummaryRow>(
      `${INSTALL_SUMMARY} WHERE i.id = $1`, [installId]);
    return rows[0] === undefined ? null : toSummary(rows[0]);
  }

  async listHistory(query: HistoryQuery): Promise<Page<StoredHistoryRecord>> {
    const { rows } = await this.#pool.query<HistoryRow & Paged>(HISTORY_PAGE, [
      query.installId, query.kind, query.status, query.pageSize, offsetOf(query)]);
    return toPage(rows, query, toHistory);
  }

  async listLogs(query: LogQuery): Promise<Page<StoredLogRecord>> {
    const pattern = query.search == null ? null : likePattern(query.search);
    const { rows } = await this.#pool.query<LogRow & Paged>(LOG_PAGE, [
      query.installId, query.maxLevelRank, pattern, query.pageSize, offsetOf(query)]);
    return toPage(rows, query, toLog);
  }

  async historyBreakdown(installId: string): Promise<readonly HistoryBreakdownCell[]> {
    const { rows } = await this.#pool.query<HistoryBreakdownCell>(HISTORY_BREAKDOWN, [installId]);
    return rows;
  }

  async journalSpan(installId: string): Promise<JournalSpan> {
    const { rows } = await this.#pool.query<SpanRow>(JOURNAL_SPAN, [installId]);
    const row = rows[0];
    return {
      oldestAt: row?.oldest_at ?? null, newestAt: row?.newest_at ?? null,
      oldestReceivedAt: row?.oldest_received_at ?? null, runCount: row?.run_count ?? 0,
    };
  }

  async findRun(key: RunKey): Promise<RunSummary | null> {
    const { rows } = await this.#pool.query<RunSummaryRow>(
      RUN_SUMMARY, [key.installId, key.runId]);
    return toRunSummary(key, rows[0]);
  }

  async listRun(query: RunQuery): Promise<Page<RunEntry>> {
    const { rows } = await this.#pool.query<RunRow & Paged>(RUN_PAGE, [
      query.installId, query.runId, query.pageSize, offsetOf(query)]);
    return toPage(rows, query, toRunEntry);
  }

  streamHistory(installId: string): AsyncIterable<StoredHistoryRecord> {
    return this.#stream(HISTORY_CHUNK, installId, toHistory);
  }

  streamLogs(installId: string): AsyncIterable<StoredLogRecord> {
    return this.#stream(LOG_CHUNK, installId, toLog);
  }

  async *#stream<R extends QueryResultRow, T>(
    sql: string, installId: string, map: (row: R) => T,
  ): AsyncGenerator<T> {
    let after: ChunkCursor | undefined;
    for (;;) {
      const params = [installId, after?.ts_cursor ?? null, after?.id ?? null, EXPORT_CHUNK_ROWS];
      const result = await this.#pool.query<R & ChunkCursor>(sql, params);
      for (const row of result.rows) yield map(row);
      if (result.rows.length < EXPORT_CHUNK_ROWS) return;
      after = result.rows.at(-1);
    }
  }
}
