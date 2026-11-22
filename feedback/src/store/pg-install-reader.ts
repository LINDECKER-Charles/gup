import type { Pool } from "pg";
import type { HistoryKind } from "../domain/journal.js";
import type {
  HistoryQuery, InstallReader, InstallSummary, LogQuery, StoredHistoryRecord, StoredLogRecord,
} from "../ports/install-reader.js";
import type { Page, PageRequest } from "../ports/page.js";

const SUMMARY = `SELECT i.id, i.gup_version, i.platform, i.arch, i.node_version, i.locale,
    i.first_seen_at, i.last_seen_at,
    (SELECT count(*) FROM install_history_item h WHERE h.install_id = i.id)::int AS history_count,
    (SELECT count(*) FROM install_log_item l WHERE l.install_id = i.id)::int AS log_count,
    (SELECT count(*) FROM feedback f WHERE f.install_id = i.id)::int AS feedback_count
  FROM install i`;

interface SummaryRow {
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
  id: string;
  ts: Date;
  run_id: string;
  data: Record<string, unknown>;
  total: number;
}

function toSummary(row: SummaryRow): InstallSummary {
  return {
    id: row.id, gupVersion: row.gup_version, platform: row.platform, arch: row.arch,
    node: row.node_version, locale: row.locale, firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at, historyCount: row.history_count, logCount: row.log_count,
    feedbackCount: row.feedback_count,
  };
}

function toRecord(row: RecordRow) {
  return { id: Number(row.id), ts: row.ts, runId: row.run_id, data: row.data };
}

function offsetOf(request: PageRequest): number {
  return (request.page - 1) * request.pageSize;
}

/**
 * Wraps the rows of a page query that also selected `count(*) OVER () AS total`.
 * A page past the end has no row to carry the total: it reads as empty, which
 * is what the back office shows for it anyway.
 */
function toPage<R extends { total: number }, T>(
  rows: readonly R[], request: PageRequest, map: (row: R) => T,
): Page<T> {
  const { page, pageSize } = request;
  return { items: rows.map(map), total: rows[0]?.total ?? 0, page, pageSize };
}

export class PgInstallReader implements InstallReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async list(request: PageRequest): Promise<Page<InstallSummary>> {
    const { rows } = await this.#pool.query<SummaryRow & { total: number }>(
      `SELECT s.*, count(*) OVER ()::int AS total FROM (${SUMMARY}) s
       ORDER BY s.last_seen_at DESC, s.id LIMIT $1 OFFSET $2`,
      [request.pageSize, offsetOf(request)]);
    return toPage(rows, request, toSummary);
  }

  async find(installId: string): Promise<InstallSummary | null> {
    const { rows } = await this.#pool.query<SummaryRow>(`${SUMMARY} WHERE i.id = $1`, [installId]);
    return rows[0] === undefined ? null : toSummary(rows[0]);
  }

  async listHistory(query: HistoryQuery): Promise<Page<StoredHistoryRecord>> {
    const { rows } = await this.#pool.query<RecordRow & { kind: HistoryKind; status: string }>(
      `SELECT id, ts, run_id, data, kind, status, count(*) OVER ()::int AS total
       FROM install_history_item
       WHERE install_id = $1 AND kind = $2 AND ($3::text IS NULL OR status = $3)
       ORDER BY ts DESC, id DESC LIMIT $4 OFFSET $5`,
      [query.installId, query.kind, query.status, query.pageSize, offsetOf(query)]);
    return toPage(rows, query, (row) => ({ ...toRecord(row), kind: row.kind, status: row.status }));
  }

  async listLogs(query: LogQuery): Promise<Page<StoredLogRecord>> {
    const { rows } = await this.#pool.query<RecordRow & { level_rank: number; event: string }>(
      `SELECT id, ts, run_id, data, level_rank, event, count(*) OVER ()::int AS total
       FROM install_log_item
       WHERE install_id = $1 AND level_rank <= $2
       ORDER BY ts DESC, id DESC LIMIT $3 OFFSET $4`,
      [query.installId, query.maxLevelRank, query.pageSize, offsetOf(query)]);
    return toPage(rows, query, (row) => ({
      ...toRecord(row), levelRank: row.level_rank, event: row.event,
    }));
  }
}
