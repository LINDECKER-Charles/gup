export interface AdminSession {
  /** sha256 of the cookie value; the value itself is never stored. */
  readonly tokenHash: Buffer;
  readonly csrfToken: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  /** Absolute expiry, fixed at creation. */
  readonly expiresAt: Date;
  /**
   * The password is right, the TOTP code not given yet: such a session opens
   * nothing but the code form.
   */
  readonly secondFactorDue: boolean;
  /** Wrong codes typed in this session. */
  readonly failedCodes: number;
}

export interface SessionRepository {
  create(session: AdminSession): Promise<void>;
  find(tokenHash: Buffer): Promise<AdminSession | null>;
  touch(tokenHash: Buffer, at: Date): Promise<void>;
  /** Counts one more wrong code; returns the new total (0 when the session is gone). */
  countFailedCode(tokenHash: Buffer): Promise<number>;
  remove(tokenHash: Buffer): Promise<void>;
}
