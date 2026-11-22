import { randomUUID } from "node:crypto";
import {
  grantedPermissions, type McpAccess, type McpAccessLifetime, type McpPermission,
} from "../domain/mcp-access.js";
import type { Clock } from "../ports/clock.js";
import type { McpAccessStore, McpGrant } from "../ports/mcp-access-store.js";
import { MCP_TOKEN } from "../security/mcp-token.js";
import { sha256 } from "../security/sha256.js";
import { DURATION_MS } from "../time-units.js";

export interface McpAccessRequest {
  readonly name: string;
  readonly permissions: readonly McpPermission[];
  readonly lifetimeDays: McpAccessLifetime;
}

/** A new access and its token: the only moment the token exists outside its holder. */
export interface IssuedMcpAccess {
  readonly access: McpAccess;
  readonly token: string;
}

/** The scheme name is case-insensitive (RFC 9110); the token is not. */
const BEARER_SCHEME = "bearer";

function bearerToken(authorization: string | undefined): string | null {
  const [scheme, token, ...rest] = (authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== BEARER_SCHEME || token === undefined || rest.length > 0) {
    return null;
  }
  return MCP_TOKEN.isWellFormed(token) ? token : null;
}

/**
 * The accesses to /mcp: issued and revoked from the back office, checked on
 * each MCP request. A token is stored as its SHA-256 only — 256 random bits
 * need no slow hash — and looked up by it.
 */
export class McpAccesses {
  readonly #store: McpAccessStore;
  readonly #clock: Clock;

  constructor(store: McpAccessStore, clock: Clock) {
    this.#store = store;
    this.#clock = clock;
  }

  async issue(request: McpAccessRequest): Promise<IssuedMcpAccess> {
    const now = this.#clock.now();
    const token = MCP_TOKEN.create();
    const access: McpAccess = {
      id: randomUUID(),
      name: request.name,
      permissions: grantedPermissions(request.permissions),
      tokenHint: MCP_TOKEN.hint(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + request.lifetimeDays * DURATION_MS.day),
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.#store.create({ ...access, tokenDigest: sha256(token) });
    return { access, token };
  }

  list(): Promise<McpAccess[]> {
    return this.#store.list();
  }

  /** false when the access is unknown, expired or already revoked. */
  revoke(id: string): Promise<boolean> {
    return this.#store.revoke(id, this.#clock.now());
  }

  /** What an `Authorization` header opens, its use recorded; null when it opens nothing. */
  async authorize(authorization: string | undefined): Promise<McpGrant | null> {
    const token = bearerToken(authorization);
    if (token === null) return null;
    return this.#store.use(sha256(token), this.#clock.now());
  }
}
