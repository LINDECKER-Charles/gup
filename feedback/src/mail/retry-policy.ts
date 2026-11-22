import { DURATION_MS } from "../time-units.js";

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = DURATION_MS.minute;
const MAX_DELAY_MS = 6 * DURATION_MS.hour;

/**
 * Outbox retries: up to 8 attempts, the wait doubling from one minute
 * (1, 2, 4 … 64 min): about two hours of SMTP outage are absorbed before a
 * mail is given up — and the feedback itself is never lost, only its mail.
 */
export const RETRY_POLICY = {
  maxAttempts: MAX_ATTEMPTS,
  /** Wait before the next attempt, after `attempts` failed ones (1-based). */
  delayAfter(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
  },
} as const;
