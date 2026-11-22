import type { Pool } from "pg";
import type {
  AdminSession, SecondFactorStage, SessionRepository,
} from "../ports/session-repository.js";

interface SessionRow {
  token_hash: Buffer;
  csrf_token: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  second_factor: SecondFactorStage;
  code_attempts: number;
}

export class PgSessionRepository implements SessionRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async create(session: AdminSession): Promise<void> {
    await this.#pool.query(
      `INSERT INTO admin_session (token_hash, csrf_token, created_at, last_seen_at, expires_at,
         second_factor, code_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [session.tokenHash, session.csrfToken, session.createdAt, session.lastSeenAt,
        session.expiresAt, session.secondFactor, session.codeAttempts]);
  }

  async find(tokenHash: Buffer): Promise<AdminSession | null> {
    const { rows } = await this.#pool.query<SessionRow>(
      "SELECT * FROM admin_session WHERE token_hash = $1", [tokenHash]);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      tokenHash: row.token_hash,
      csrfToken: row.csrf_token,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      secondFactor: row.second_factor,
      codeAttempts: row.code_attempts,
    };
  }

  async touch(tokenHash: Buffer, at: Date): Promise<void> {
    await this.#pool.query(
      "UPDATE admin_session SET last_seen_at = $2 WHERE token_hash = $1", [tokenHash, at]);
  }

  async reserveCodeAttempt(tokenHash: Buffer, max: number): Promise<number | null> {
    const { rows } = await this.#pool.query<{ code_attempts: number }>(
      `UPDATE admin_session SET code_attempts = code_attempts + 1
       WHERE token_hash = $1 AND second_factor = 'due' AND code_attempts < $2
       RETURNING code_attempts`, [tokenHash, max]);
    return rows[0]?.code_attempts ?? null;
  }

  async remove(tokenHash: Buffer): Promise<void> {
    await this.#pool.query("DELETE FROM admin_session WHERE token_hash = $1", [tokenHash]);
  }
}
