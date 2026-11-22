/**
 * The queries of the journal reader. Every one is scoped by `install_id`
 * first: the indexes of migrations 001 and 002 all lead with it.
 */

export const INSTALL_SUMMARY = `SELECT i.id, i.gup_version, i.platform, i.arch, i.node_version,
    i.locale, i.first_seen_at, i.last_seen_at,
    (SELECT count(*) FROM install_history_item h WHERE h.install_id = i.id)::int AS history_count,
    (SELECT count(*) FROM install_log_item l WHERE l.install_id = i.id)::int AS log_count,
    (SELECT count(*) FROM feedback f WHERE f.install_id = i.id)::int AS feedback_count
  FROM install i`;

const HISTORY_COLUMNS = "id, ts, run_id, data, kind, status";
const LOG_COLUMNS = "id, ts, run_id, data, level_rank, event";

/** `$1` install, `$2` kind, `$3` status (each null = any), `$4` limit, `$5` offset. */
export const HISTORY_PAGE = `SELECT ${HISTORY_COLUMNS}, count(*) OVER ()::int AS total
  FROM install_history_item
  WHERE install_id = $1 AND ($2::text IS NULL OR kind = $2) AND ($3::text IS NULL OR status = $3)
  ORDER BY ts DESC, id DESC LIMIT $4 OFFSET $5`;

/**
 * `$3` is a LIKE pattern. `data::text` finds keys and plain values; the
 * scalar walk finds values the JSON text escapes (a Windows path's `\`,
 * a quote), which the serialised form would hide from a literal search.
 */
const LOG_MATCHES = `(event ILIKE $3 OR data::text ILIKE $3
  OR EXISTS (SELECT 1 FROM jsonb_path_query(data, 'strict $.**') AS node (value)
    WHERE jsonb_typeof(node.value) IN ('string', 'number', 'boolean')
      AND node.value #>> '{}' ILIKE $3))`;

/** `$1` install, `$2` max level rank, `$3` pattern or null, `$4` limit, `$5` offset. */
export const LOG_PAGE = `SELECT ${LOG_COLUMNS}, count(*) OVER ()::int AS total
  FROM install_log_item
  WHERE install_id = $1 AND level_rank <= $2 AND ($3::text IS NULL OR ${LOG_MATCHES})
  ORDER BY ts DESC, id DESC LIMIT $4 OFFSET $5`;

export const HISTORY_BREAKDOWN = `SELECT kind, status, count(*)::int AS count
  FROM install_history_item WHERE install_id = $1
  GROUP BY kind, status ORDER BY kind, status`;

export const JOURNAL_SPAN = `SELECT min(ts) AS oldest_at, max(ts) AS newest_at,
    min(received_at) AS oldest_received_at, count(DISTINCT run_id)::int AS run_count
  FROM (
    SELECT ts, received_at, run_id FROM install_history_item WHERE install_id = $1
    UNION ALL
    SELECT ts, received_at, run_id FROM install_log_item WHERE install_id = $1
  ) journal`;

/** One run's records from both tables, tagged; `$1` install, `$2` run. */
const RUN_RECORDS = `SELECT 'history' AS source, ${HISTORY_COLUMNS},
      NULL::smallint AS level_rank, NULL::text AS event
    FROM install_history_item WHERE install_id = $1 AND run_id = $2
    UNION ALL
    SELECT 'log', id, ts, run_id, data, NULL, NULL, level_rank, event
    FROM install_log_item WHERE install_id = $1 AND run_id = $2`;

export const RUN_SUMMARY = `SELECT min(ts) AS started_at, max(ts) AS ended_at,
    count(*) FILTER (WHERE source = 'history')::int AS history_count,
    count(*) FILTER (WHERE source = 'log')::int AS log_count,
    count(*) FILTER (WHERE source = 'log' AND level_rank = 0)::int AS error_count,
    count(*) FILTER (WHERE source = 'history' AND kind = 'update' AND status = 'failed')::int
      AS failed_update_count
  FROM (${RUN_RECORDS}) run`;

/** A log written while an update ran precedes the update's record at the same instant. */
export const RUN_PAGE = `SELECT run.*, count(*) OVER ()::int AS total FROM (${RUN_RECORDS}) run
  ORDER BY ts, source DESC, id LIMIT $3 OFFSET $4`;

/**
 * Keyset chunks for the export: `$2`/`$3` the last (ts, id) read, null at
 * first. The cursor travels as text: a JavaScript Date would drop the
 * microseconds Postgres keeps, and the same row would come back forever.
 */
function chunk(table: string, columns: string): string {
  return `SELECT ${columns}, ts::text AS ts_cursor FROM ${table}
  WHERE install_id = $1 AND ($2::timestamptz IS NULL OR (ts, id) > ($2::timestamptz, $3::bigint))
  ORDER BY ts, id LIMIT $4`;
}

export const HISTORY_CHUNK = chunk("install_history_item", HISTORY_COLUMNS);
export const LOG_CHUNK = chunk("install_log_item", LOG_COLUMNS);
