import { consumeInterrupt, getInstallTimeoutSeconds } from "../runner.js";
import type { UpdateOutcome } from "../types.js";

/** The skip message, whatever skipped it: Ctrl+C in the console, `s` in the run view. */
export const MANUAL_SKIP_MESSAGE = "ignorée par l'utilisateur";

/**
 * Rewrite an interrupted outcome (manual skip or timeout) as a deliberate
 * SKIP so the summary shows it as a skip rather than a hard failure, and the
 * retry step doesn't offer to retry something the user explicitly skipped.
 * Pass-through when the run completed normally.
 */
export function finalizeOutcome(outcome: UpdateOutcome): UpdateOutcome {
  const { timedOut, aborted } = consumeInterrupt();
  if (timedOut) {
    return skippedAs(outcome, `timeout (${getInstallTimeoutSeconds()}s) — install ignorée`);
  }
  if (aborted) return skippedAs(outcome, MANUAL_SKIP_MESSAGE);
  return outcome;
}

function skippedAs(outcome: UpdateOutcome, message: string): UpdateOutcome {
  return { ...outcome, success: false, skipped: true, retryable: false, message };
}

/**
 * Drop any interrupt flag left behind by a runInherit call that isn't routed
 * through {@link finalizeOutcome} (e.g. the elevated-batch PowerShell wait), so
 * a stale flag can't bleed into the next package's outcome.
 */
export function discardPendingInterrupt(): void {
  consumeInterrupt();
}
