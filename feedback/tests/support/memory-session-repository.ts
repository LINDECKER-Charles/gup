import type { AdminSession, SessionRepository } from "../../src/ports/session-repository.js";

export class MemorySessionRepository implements SessionRepository {
  readonly sessions = new Map<string, AdminSession>();

  async create(session: AdminSession): Promise<void> {
    this.sessions.set(session.tokenHash.toString("hex"), session);
  }

  async find(tokenHash: Buffer): Promise<AdminSession | null> {
    return this.sessions.get(tokenHash.toString("hex")) ?? null;
  }

  async touch(tokenHash: Buffer, at: Date): Promise<void> {
    this.#update(tokenHash, (session) => ({ ...session, lastSeenAt: at }));
  }

  async countFailedCode(tokenHash: Buffer): Promise<number> {
    const changed = this.#update(tokenHash, (session) => ({
      ...session, failedCodes: session.failedCodes + 1,
    }));
    return changed?.failedCodes ?? 0;
  }

  async remove(tokenHash: Buffer): Promise<void> {
    this.sessions.delete(tokenHash.toString("hex"));
  }

  #update(tokenHash: Buffer, change: (session: AdminSession) => AdminSession): AdminSession | null {
    const key = tokenHash.toString("hex");
    const session = this.sessions.get(key);
    if (session === undefined) return null;
    const changed = change(session);
    this.sessions.set(key, changed);
    return changed;
  }
}
