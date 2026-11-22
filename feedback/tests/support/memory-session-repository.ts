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
    const key = tokenHash.toString("hex");
    const session = this.sessions.get(key);
    if (session !== undefined) this.sessions.set(key, { ...session, lastSeenAt: at });
  }

  /** Synchronous check-and-set: as atomic as the single UPDATE it stands for. */
  async reserveCodeAttempt(tokenHash: Buffer, max: number): Promise<number | null> {
    const key = tokenHash.toString("hex");
    const session = this.sessions.get(key);
    if (session === undefined || session.secondFactor !== "due") return null;
    if (session.codeAttempts >= max) return null;
    const codeAttempts = session.codeAttempts + 1;
    this.sessions.set(key, { ...session, codeAttempts });
    return codeAttempts;
  }

  async remove(tokenHash: Buffer): Promise<void> {
    this.sessions.delete(tokenHash.toString("hex"));
  }
}
