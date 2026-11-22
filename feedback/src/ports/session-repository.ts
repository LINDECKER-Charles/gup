export interface AdminSession {
  /** sha256 of the cookie value; the value itself is never stored. */
  readonly tokenHash: Buffer;
  readonly csrfToken: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  /** Absolute expiry, fixed at creation. */
  readonly expiresAt: Date;
}

export interface SessionRepository {
  create(session: AdminSession): Promise<void>;
  find(tokenHash: Buffer): Promise<AdminSession | null>;
  touch(tokenHash: Buffer, at: Date): Promise<void>;
  remove(tokenHash: Buffer): Promise<void>;
}
