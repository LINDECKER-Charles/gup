import type { Pool } from "pg";
import { isMcpPermission, type McpAccess } from "../domain/mcp-access.js";
import type { McpAccessStore, McpGrant, NewMcpAccess } from "../ports/mcp-access-store.js";

interface AccessRow {
  id: string;
  name: string;
  permissions: string[];
  token_hint: string;
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

const ACCESS_COLUMNS = `id, name, permissions, token_hint, created_at, expires_at,
  last_used_at, revoked_at`;

function toAccess(row: AccessRow): McpAccess {
  return {
    id: row.id,
    name: row.name,
    permissions: row.permissions.filter(isMcpPermission),
    tokenHint: row.token_hint,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export class PgMcpAccessStore implements McpAccessStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async create(access: NewMcpAccess): Promise<void> {
    await this.#pool.query(
      `INSERT INTO mcp_access (id, name, token_sha256, token_hint, permissions, created_at,
         expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [access.id, access.name, access.tokenDigest, access.tokenHint, access.permissions,
        access.createdAt, access.expiresAt]);
  }

  async list(): Promise<McpAccess[]> {
    const { rows } = await this.#pool.query<AccessRow>(
      `SELECT ${ACCESS_COLUMNS} FROM mcp_access ORDER BY created_at DESC, id`);
    return rows.map(toAccess);
  }

  async use(tokenDigest: Buffer, now: Date): Promise<McpGrant | null> {
    const { rows } = await this.#pool.query<Pick<AccessRow, "id" | "permissions">>(
      `UPDATE mcp_access SET last_used_at = $2
       WHERE token_sha256 = $1 AND revoked_at IS NULL AND expires_at > $2
       RETURNING id, permissions`,
      [tokenDigest, now]);
    const row = rows[0];
    return row === undefined
      ? null
      : { accessId: row.id, permissions: row.permissions.filter(isMcpPermission) };
  }

  async revoke(id: string, at: Date): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE mcp_access SET revoked_at = $2
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > $2`,
      [id, at]);
    return rowCount === 1;
  }
}
