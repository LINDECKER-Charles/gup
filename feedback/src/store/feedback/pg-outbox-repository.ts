import type { Pool } from "pg";
import type {
  ClaimRequest, MailFailure, OutboxRepository, PendingMail,
} from "../../ports/outbox-repository.js";
import { FEEDBACK_COLUMNS } from "./feedback-columns.js";
import { toFeedback, type FeedbackRow } from "./feedback-row.js";

/**
 * Lease, don't hold: the claim pushes `next_attempt_at` past the lease and
 * commits at once, so no transaction stays open while SMTP talks. Concurrent
 * workers skip each other's locked rows; a worker that dies mid-send leaves a
 * lease that expires, and the mail is retried (at least once, never lost).
 */
const CLAIM = `WITH due AS (
    SELECT id FROM mail_outbox
    WHERE sent_at IS NULL AND attempts < $4 AND next_attempt_at <= $1
    ORDER BY next_attempt_at, id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  )
  UPDATE mail_outbox o
  SET attempts = o.attempts + 1,
      next_attempt_at = $1::timestamptz + make_interval(secs => $3::double precision / 1000)
  FROM due, feedback f
  WHERE o.id = due.id AND f.id = o.feedback_id
  RETURNING o.id AS outbox_id, o.attempts, ${FEEDBACK_COLUMNS}`;

/** Long enough for this service's own SMTP errors to be useful, short enough for a cell. */
const MAX_ERROR_LENGTH = 1000;

export class PgOutboxRepository implements OutboxRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async claimDue(request: ClaimRequest): Promise<readonly PendingMail[]> {
    const { rows } = await this.#pool.query<FeedbackRow & { outbox_id: string; attempts: number }>(
      CLAIM, [request.now, request.limit, request.leaseMs, request.maxAttempts]);
    return rows.map((row) => ({
      id: Number(row.outbox_id),
      attempts: row.attempts,
      feedback: toFeedback(row),
    }));
  }

  async markSent(id: number, at: Date): Promise<void> {
    await this.#pool.query(
      "UPDATE mail_outbox SET sent_at = $2, last_error = NULL WHERE id = $1", [id, at]);
  }

  async markFailed(failure: MailFailure): Promise<void> {
    await this.#pool.query(
      `UPDATE mail_outbox
       SET last_error = $2, next_attempt_at = COALESCE($3, next_attempt_at)
       WHERE id = $1`,
      [failure.id, failure.error.slice(0, MAX_ERROR_LENGTH), failure.retryAt]);
  }
}
