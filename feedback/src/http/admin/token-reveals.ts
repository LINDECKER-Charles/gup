import type { IssuedMcpAccess } from "../../auth/mcp-accesses.js";
import type { Clock } from "../../ports/clock.js";
import type { AdminSession } from "../../ports/session-repository.js";
import { DURATION_MS } from "../../time-units.js";

/** Long enough to follow the redirect, short enough not to linger. */
const REVEAL_TTL_MS = 10 * DURATION_MS.minute;

interface PendingReveal {
  readonly issued: IssuedMcpAccess;
  readonly expiresAt: number;
  readonly timer: NodeJS.Timeout;
}

/**
 * Told of an access whose token nobody will ever see, so nobody can use it either.
 * Settles without rejecting: it is not awaited, except on shutdown.
 */
export type UnseenAccessHandler = (issued: IssuedMcpAccess) => Promise<void>;

function keyOf(session: AdminSession): string {
  return session.tokenHash.toString("hex");
}

/**
 * The token of an access just issued, between the form's POST and the one
 * page that shows it: in memory only, bound to the session that issued it,
 * handed out once, dropped after a few minutes. A reload of that page finds
 * nothing: the token is never shown twice. A token dropped unseen — replaced
 * by a second issue, or expired — goes to `onUnseen`.
 */
export class TokenReveals {
  readonly #pending = new Map<string, PendingReveal>();
  readonly #clock: Clock;
  readonly #onUnseen: UnseenAccessHandler;

  constructor(clock: Clock, onUnseen: UnseenAccessHandler) {
    this.#clock = clock;
    this.#onUnseen = onUnseen;
  }

  /** One pending token per session: a second issue before the first is shown drops it. */
  hold(session: AdminSession, issued: IssuedMcpAccess): void {
    const key = keyOf(session);
    void this.#dropUnseen(key);
    // The clock decides when a token is too old to show; the timer only frees the memory.
    const expiresAt = this.#clock.now().getTime() + REVEAL_TTL_MS;
    const timer = setTimeout(() => void this.#dropUnseen(key), REVEAL_TTL_MS).unref();
    this.#pending.set(key, { issued, expiresAt, timer });
  }

  take(session: AdminSession): IssuedMcpAccess | null {
    const key = keyOf(session);
    const pending = this.#remove(key);
    if (pending === null) return null;
    if (pending.expiresAt > this.#clock.now().getTime()) return pending.issued;
    void this.#onUnseen(pending.issued);
    return null;
  }

  /** Forgets every pending token, unseen, once handled: the service is stopping. */
  async clear(): Promise<void> {
    await Promise.all([...this.#pending.keys()].map((key) => this.#dropUnseen(key)));
  }

  async #dropUnseen(key: string): Promise<void> {
    const pending = this.#remove(key);
    if (pending !== null) await this.#onUnseen(pending.issued);
  }

  #remove(key: string): PendingReveal | null {
    const pending = this.#pending.get(key);
    if (pending === undefined) return null;
    clearTimeout(pending.timer);
    this.#pending.delete(key);
    return pending;
  }
}
