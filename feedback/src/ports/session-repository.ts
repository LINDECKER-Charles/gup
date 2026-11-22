/**
 * How far a session got: `due` = the password is right, the TOTP code not
 * given yet; `passed` = both factors; `skipped` = the password alone, opened
 * while no TOTP key was configured.
 */
export type SecondFactorStage = "due" | "passed" | "skipped";

export interface AdminSession {
  /** sha256 of the cookie value; the value itself is never stored. */
  readonly tokenHash: Buffer;
  readonly csrfToken: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  /** Absolute expiry, fixed at creation. */
  readonly expiresAt: Date;
  readonly secondFactor: SecondFactorStage;
  /** Codes tried in this session, right or wrong. */
  readonly codeAttempts: number;
}

export interface SessionRepository {
  create(session: AdminSession): Promise<void>;
  find(tokenHash: Buffer): Promise<AdminSession | null>;
  touch(tokenHash: Buffer, at: Date): Promise<void>;
  /**
   * Takes one code attempt of a `due` session, atomically: returns its number,
   * or null when the session is gone, not `due`, or has had `max` already.
   */
  reserveCodeAttempt(tokenHash: Buffer, max: number): Promise<number | null>;
  remove(tokenHash: Buffer): Promise<void>;
}
