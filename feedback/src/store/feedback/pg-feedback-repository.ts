import type { Pool } from "pg";
import {
  FEEDBACK_VOCABULARY,
  type Feedback, type FeedbackKind, type FeedbackStatus, type NewFeedback, type StatusCounts,
} from "../../domain/feedback.js";
import type { FeedbackQuery, FeedbackRepository } from "../../ports/feedback-repository.js";
import type { Page } from "../../ports/page.js";
import { FEEDBACK_COLUMNS } from "./feedback-columns.js";
import { toFeedback, type FeedbackRow } from "./feedback-row.js";

/** `$1` = status or null, `$2` = kind or null. */
const FILTER = "($1::text IS NULL OR f.status = $1) AND ($2::text IS NULL OR f.kind = $2)";

export class PgFeedbackRepository implements FeedbackRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  /**
   * One statement, so one implicit transaction: the feedback and its outbox
   * row exist together or not at all.
   */
  async create(feedback: NewFeedback): Promise<number> {
    const { rows } = await this.#pool.query<{ id: string }>(
      `WITH created AS (
        INSERT INTO feedback
          (kind, title, message, email, install_id, gup_version, platform, locale)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      ), queued AS (
        INSERT INTO mail_outbox (feedback_id) SELECT id FROM created
      )
      SELECT id FROM created`,
      [feedback.kind, feedback.title, feedback.message, feedback.email, feedback.installId,
        feedback.gupVersion, feedback.platform, feedback.locale],
    );
    return Number(rows[0]?.id);
  }

  async list(query: FeedbackQuery): Promise<Page<Feedback>> {
    const filter = [query.status, query.kind];
    const offset = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.#pool.query<FeedbackRow>(
        `SELECT ${FEEDBACK_COLUMNS} FROM feedback f WHERE ${FILTER}
         ORDER BY f.created_at DESC, f.id DESC LIMIT $3 OFFSET $4`,
        [...filter, query.pageSize, offset],
      ),
      this.#pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM feedback f WHERE ${FILTER}`, filter),
    ]);
    return {
      items: items.rows.map(toFeedback),
      total: total.rows[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async countByStatus(kind: FeedbackKind | null): Promise<StatusCounts> {
    const { rows } = await this.#pool.query<{ status: FeedbackStatus; count: number }>(
      `SELECT status, count(*)::int AS count FROM feedback
       WHERE $1::text IS NULL OR kind = $1 GROUP BY status`,
      [kind],
    );
    const counts = Object.fromEntries(FEEDBACK_VOCABULARY.statuses.map((status) => [status, 0]));
    for (const row of rows) counts[row.status] = row.count;
    return counts as StatusCounts;
  }

  async find(id: number): Promise<Feedback | null> {
    const { rows } = await this.#pool.query<FeedbackRow>(
      `SELECT ${FEEDBACK_COLUMNS} FROM feedback f WHERE f.id = $1`, [id]);
    return rows[0] === undefined ? null : toFeedback(rows[0]);
  }

  async listByInstall(installId: string): Promise<readonly Feedback[]> {
    const { rows } = await this.#pool.query<FeedbackRow>(
      `SELECT ${FEEDBACK_COLUMNS} FROM feedback f WHERE f.install_id = $1
       ORDER BY f.created_at DESC, f.id DESC`, [installId]);
    return rows.map(toFeedback);
  }

  async updateStatus(id: number, status: FeedbackStatus): Promise<void> {
    await this.#pool.query(
      "UPDATE feedback SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
  }

  async updateNote(id: number, note: string): Promise<void> {
    await this.#pool.query(
      "UPDATE feedback SET note = $2, updated_at = now() WHERE id = $1", [id, note]);
  }

  async remove(id: number): Promise<void> {
    await this.#pool.query("DELETE FROM feedback WHERE id = $1", [id]);
  }
}
