import type { McpAccess, McpPermission } from "../domain/mcp-access.js";

/** An access as issued: its token is gone, only the token's SHA-256 is stored. */
export interface NewMcpAccess extends Omit<McpAccess, "lastUsedAt" | "revokedAt"> {
  readonly tokenDigest: Buffer;
}

/** What a valid token opens: which access it is, and what that access may do. */
export interface McpGrant {
  readonly accessId: string;
  readonly permissions: readonly McpPermission[];
}

export interface McpAccessStore {
  create(access: NewMcpAccess): Promise<void>;
  /** Every access, newest first. */
  list(): Promise<McpAccess[]>;
  /**
   * The grant of the access whose token has this SHA-256 and that is active
   * at `now`, its last use set to `now`, in one statement; null when no
   * access has that token, or it expired or was revoked.
   */
  use(tokenDigest: Buffer, now: Date): Promise<McpGrant | null>;
  /** Revokes the access if it is active at `at`; false when there is no such access. */
  revoke(id: string, at: Date): Promise<boolean>;
}
