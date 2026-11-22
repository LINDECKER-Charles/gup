import type { McpAccess } from "../../src/domain/mcp-access.js";
import type { McpAccessStore, McpGrant, NewMcpAccess } from "../../src/ports/mcp-access-store.js";

type StoredAccess = McpAccess & { readonly tokenDigest: Buffer };

function isActive(access: StoredAccess, now: Date): boolean {
  return access.revokedAt === null && access.expiresAt.getTime() > now.getTime();
}

function withoutDigest({ tokenDigest: _digest, ...access }: StoredAccess): McpAccess {
  return access;
}

/** The port's semantics in memory, as PgMcpAccessStore implements them in SQL. */
export class MemoryMcpAccessStore implements McpAccessStore {
  readonly #accesses: StoredAccess[] = [];

  async create(access: NewMcpAccess): Promise<void> {
    if (this.#accesses.some((stored) => stored.tokenDigest.equals(access.tokenDigest))) {
      throw new Error("duplicate token digest");
    }
    this.#accesses.push({ ...access, lastUsedAt: null, revokedAt: null });
  }

  async list(): Promise<McpAccess[]> {
    return [...this.#accesses]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
      .map(withoutDigest);
  }

  async use(tokenDigest: Buffer, now: Date): Promise<McpGrant | null> {
    const index = this.#accesses.findIndex((access) =>
      access.tokenDigest.equals(tokenDigest) && isActive(access, now));
    const access = this.#accesses[index];
    if (access === undefined) return null;
    this.#accesses[index] = { ...access, lastUsedAt: now };
    return { accessId: access.id, permissions: access.permissions };
  }

  async revoke(id: string, at: Date): Promise<boolean> {
    const index = this.#accesses.findIndex((access) => access.id === id && isActive(access, at));
    const access = this.#accesses[index];
    if (access === undefined) return false;
    this.#accesses[index] = { ...access, revokedAt: at };
    return true;
  }

  /** The stored accesses with their digests, for assertions: never a token. */
  stored(): readonly StoredAccess[] {
    return this.#accesses;
  }
}
