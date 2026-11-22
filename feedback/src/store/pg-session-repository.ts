import type { Pool } from "pg";
import type { AdminSession, SessionRepository } from "../ports/session-repository.js";

interface SessionRow {
  token_hash: Buffer;
  csrf_token: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
}

export class PgSessionRepository implements SessionRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async create(session: AdminSession): Promise<void> {
    await this.#pool.query(
      `INSERT INTO admin_session (token_hash, csrf_token, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.tokenHash, session.csrfToken, session.createdAt, session.lastSeenAt,
        session.expiresAt]);
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
    };
  }

  async touch(tokenHash: Buffer, at: Date): Promise<void> {
    await this.#pool.query(
      "UPDATE admin_session SET last_seen_at = $2 WHERE token_hash = $1", [tokenHash, at]);
  }

  async remove(tokenHash: Buffer): Promise<void> {
    await this.#pool.query("DELETE FROM admin_session WHERE token_hash = $1", [tokenHash]);
  }
}
