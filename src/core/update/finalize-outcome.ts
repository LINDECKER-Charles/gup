import { consumeInterrupt, getInstallTimeoutSeconds } from "../runner.js";
import type { UpdateOutcome } from "../types.js";

/** The skip message, whatever skipped it: Ctrl+C in the console, `s` in the run view. */
export const MANUAL_SKIP_MESSAGE = "ignorée par l'utilisateur";

/** Between an outcome's message and the provider's recovery note. */
const RECOVERY_SEPARATOR = " — ";

/**
 * Rewrite an interrupted outcome (manual skip or timeout) as a deliberate
 * SKIP so the summary shows it as a skip rather than a hard failure, and the
 * retry step doesn't offer to retry something the user explicitly skipped.
 * Whatever the provider did to recover (`recovery`) is said after the
 * message, interrupted or not.
 */
export function finalizeOutcome(outcome: UpdateOutcome): UpdateOutcome {
  const { timedOut, aborted } = consumeInterrupt();
  if (timedOut) {
    return skippedAs(outcome, `timeout (${getInstallTimeoutSeconds()}s) — install ignorée`);
  }
  if (aborted) return skippedAs(outcome, MANUAL_SKIP_MESSAGE);
  const message = messageWithRecovery(outcome.message, outcome.recovery);
  return message === undefined ? outcome : { ...outcome, message };
}

/** `outcome` as a skip for `reason`, its recovery note (if any) after the reason. */
export function skippedAs(outcome: UpdateOutcome, reason: string): UpdateOutcome {
  const message = messageWithRecovery(reason, outcome.recovery) ?? reason;
  return { ...outcome, success: false, skipped: true, retryable: false, message };
}

/** Whether {@link finalizeOutcome} made `outcome` the user's skip. */
export function isManualSkip(outcome: UpdateOutcome): boolean {
  return outcome.message === messageWithRecovery(MANUAL_SKIP_MESSAGE, outcome.recovery);
}

function messageWithRecovery(
  message: string | undefined,
  recovery: string | undefined,
): string | undefined {
  const parts = [message, recovery].filter((part) => part !== undefined && part !== "");
  return parts.length === 0 ? undefined : parts.join(RECOVERY_SEPARATOR);
}

/**
 * Drop any interrupt flag left behind by a runInherit call that isn't routed
 * through {@link finalizeOutcome} (e.g. the elevated-batch PowerShell wait), so
 * a stale flag can't bleed into the next package's outcome.
 */
export function discardPendingInterrupt(): void {
  consumeInterrupt();
}
