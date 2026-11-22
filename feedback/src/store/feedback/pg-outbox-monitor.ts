import type { Pool } from "pg";
import type { FeedbackKind } from "../../domain/feedback.js";
import type {
  OutboxCounts, OutboxMonitor, RetryRequest, UnsentMail,
} from "../../ports/mail/outbox-monitor.js";
import type { Page, PageRequest } from "../../ports/page.js";

const COUNTS = `SELECT
    count(*) FILTER (WHERE sent_at IS NULL AND attempts = 0)::int AS waiting,
    count(*) FILTER (WHERE sent_at IS NULL AND attempts > 0)::int AS failing,
    count(*) FILTER (WHERE sent_at >= $1)::int AS sent_recently
  FROM mail_outbox`;

const UNSENT_PAGE = `SELECT o.id, o.feedback_id, f.kind, f.title, o.attempts, o.next_attempt_at,
    o.last_error, o.created_at, count(*) OVER ()::int AS total
  FROM mail_outbox o JOIN feedback f ON f.id = o.feedback_id
  WHERE o.sent_at IS NULL
  ORDER BY o.created_at, o.id LIMIT $1 OFFSET $2`;

/**
 * Due now; a mail given up comes back with one attempt left, so a relay
 * fixed after a long outage still delivers what it missed. A mail leased by
 * a worker mid-send may be claimed twice: the outbox is at-least-once anyway.
 */
const RETRY_NOW = `UPDATE mail_outbox
  SET next_attempt_at = $1, attempts = LEAST(attempts, $2::int - 1)
  WHERE sent_at IS NULL`;

interface UnsentRow {
  id: string;
  feedback_id: string;
  kind: FeedbackKind;
  title: string;
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  created_at: Date;
  total: number;
}

function toUnsent(row: UnsentRow): UnsentMail {
  return {
    id: Number(row.id), feedbackId: Number(row.feedback_id), feedbackKind: row.kind,
    feedbackTitle: row.title, attempts: row.attempts, nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error, createdAt: row.created_at,
  };
}

export class PgOutboxMonitor implements OutboxMonitor {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async counts(sentSince: Date): Promise<OutboxCounts> {
    const { rows } = await this.#pool.query<{
      waiting: number; failing: number; sent_recently: number;
    }>(COUNTS, [sentSince]);
    const row = rows[0];
    return {
      waiting: row?.waiting ?? 0, failing: row?.failing ?? 0,
      sentRecently: row?.sent_recently ?? 0,
    };
  }

  async listUnsent(request: PageRequest): Promise<Page<UnsentMail>> {
    const { page, pageSize } = request;
    const { rows } = await this.#pool.query<UnsentRow>(
      UNSENT_PAGE, [pageSize, (page - 1) * pageSize]);
    return { items: rows.map(toUnsent), total: rows[0]?.total ?? 0, page, pageSize };
  }

  async retryNow(request: RetryRequest): Promise<number> {
    const result = await this.#pool.query(RETRY_NOW, [request.now, request.maxAttempts]);
    return result.rowCount ?? 0;
  }
}
