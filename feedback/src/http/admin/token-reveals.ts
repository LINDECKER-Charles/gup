import type { IssuedMcpAccess } from "../../auth/mcp-accesses.js";
import type { Clock } from "../../ports/clock.js";
import type { AdminSession } from "../../ports/session-repository.js";
import { DURATION_MS } from "../../time-units.js";

/** Long enough to follow the redirect, short enough not to linger. */
const REVEAL_TTL_MS = 10 * DURATION_MS.minute;

interface PendingReveal {
  readonly issued: IssuedMcpAccess;
  readonly expiresAt: number;
}

function keyOf(session: AdminSession): string {
  return session.tokenHash.toString("hex");
}

/**
 * The token of an access just issued, between the form's POST and the one
 * page that shows it: in memory only, bound to the session that issued it,
 * handed out once, gone after a few minutes or a restart. A reload of that
 * page finds nothing: the token is never shown twice.
 */
export class TokenReveals {
  readonly #pending = new Map<string, PendingReveal>();
  readonly #clock: Clock;

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** A second issue before the first is shown replaces it: one pending token per session. */
  hold(session: AdminSession, issued: IssuedMcpAccess): void {
    const now = this.#clock.now().getTime();
    this.#sweep(now);
    this.#pending.set(keyOf(session), { issued, expiresAt: now + REVEAL_TTL_MS });
  }

  take(session: AdminSession): IssuedMcpAccess | null {
    const key = keyOf(session);
    const pending = this.#pending.get(key);
    this.#pending.delete(key);
    if (pending === undefined || pending.expiresAt <= this.#clock.now().getTime()) return null;
    return pending.issued;
  }

  /** The tokens nobody came to see: dropped at the next issue. */
  #sweep(now: number): void {
    for (const [key, pending] of this.#pending) {
      if (pending.expiresAt <= now) this.#pending.delete(key);
    }
  }
}
