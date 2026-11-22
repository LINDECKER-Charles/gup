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
    const session = this.sessions.get(tokenHash.toString("hex"));
    if (session !== undefined) this.sessions.set(tokenHash.toString("hex"), { ...session, lastSeenAt: at });
  }

  async remove(tokenHash: Buffer): Promise<void> {
    this.sessions.delete(tokenHash.toString("hex"));
  }
}
