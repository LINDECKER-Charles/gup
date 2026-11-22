import type { Clock } from "../ports/clock.js";
import type { AdminSession, SessionRepository } from "../ports/session-repository.js";
import { randomToken } from "../security/random-token.js";
import { sha256 } from "../security/sha256.js";
import { DURATION_MS } from "../time-units.js";

const ABSOLUTE_LIFETIME_MS = 7 * DURATION_MS.day;
const IDLE_LIFETIME_MS = 12 * DURATION_MS.hour;
/** Time to open the authenticator app and type the code, not to wander off. */
const SECOND_FACTOR_LIFETIME_MS = 5 * DURATION_MS.minute;
/** Activity is recorded at most once a minute: one write per page view is waste. */
const TOUCH_INTERVAL_MS = DURATION_MS.minute;

export interface OpenedSession {
  /** Cookie value: shown once, stored only as its hash. */
  readonly token: string;
  readonly session: AdminSession;
}

/** Admin sessions: 7 days at most, 12 hours idle at most (5 minutes awaiting a code). */
export class AdminSessions {
  readonly #repository: SessionRepository;
  readonly #clock: Clock;

  constructor(deps: { readonly repository: SessionRepository; readonly clock: Clock }) {
    this.#repository = deps.repository;
    this.#clock = deps.clock;
  }

  static get absoluteLifetimeMs(): number {
    return ABSOLUTE_LIFETIME_MS;
  }

  static get idleLifetimeMs(): number {
    return IDLE_LIFETIME_MS;
  }

  /**
   * A session waiting for its second factor lives 5 minutes and opens only
   * the code form; signing in fully opens a new one (a fresh token).
   */
  async open(options: { readonly secondFactorDue?: boolean } = {}): Promise<OpenedSession> {
    const secondFactorDue = options.secondFactorDue ?? false;
    const token = randomToken();
    const now = this.#clock.now();
    const lifetimeMs = secondFactorDue ? SECOND_FACTOR_LIFETIME_MS : ABSOLUTE_LIFETIME_MS;
    const session: AdminSession = {
      tokenHash: sha256(token),
      csrfToken: randomToken(),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + lifetimeMs),
      secondFactorDue,
      failedCodes: 0,
    };
    await this.#repository.create(session);
    return { token, session };
  }

  /** Counts a wrong TOTP code against the session; returns the total so far. */
  async recordFailedCode(session: AdminSession): Promise<number> {
    return this.#repository.countFailedCode(session.tokenHash);
  }

  /** The live session the cookie names, or null when absent, unknown or expired. */
  async resolve(token: string | undefined): Promise<AdminSession | null> {
    if (token === undefined || token === "") return null;
    const session = await this.#repository.find(sha256(token));
    if (session === null) return null;
    const now = this.#clock.now().getTime();
    const isIdle = now - session.lastSeenAt.getTime() >= IDLE_LIFETIME_MS;
    return now >= session.expiresAt.getTime() || isIdle ? null : session;
  }

  /** Records activity, pushing the idle expiry back. */
  async keepAlive(session: AdminSession): Promise<void> {
    const now = this.#clock.now();
    if (now.getTime() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return;
    await this.#repository.touch(session.tokenHash, now);
  }

  async close(token: string | undefined): Promise<void> {
    if (token === undefined || token === "") return;
    await this.#repository.remove(sha256(token));
  }
}
