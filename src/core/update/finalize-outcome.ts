import { localized } from "../i18n/localized.js";
import { tellingLine } from "../process/telling-line.js";
import { consumeFailureOutput, consumeInterrupt, getInstallTimeoutSeconds } from "../runner.js";
import type { UpdateOutcome } from "../types.js";

/** The messages of an interrupted install, in the interface's language. */
export const INTERRUPT_MESSAGES = localized({
  en: {
    /** The user's skip, whatever skipped it: Ctrl+C in the console, `s` in the run view. */
    manualSkip: "skipped by the user",
    /** The install outlived the install timeout and was killed. */
    timedOut: (seconds: number) => `timeout (${seconds}s) — install skipped`,
  },
  fr: {
    manualSkip: "ignorée par l'utilisateur",
    timedOut: (seconds) => `timeout (${seconds}s) — install ignorée`,
  },
});

/** Between an outcome's message and the provider's recovery note. */
const RECOVERY_SEPARATOR = " — ";

/**
 * Rewrite an interrupted outcome (manual skip or timeout) as a deliberate
 * SKIP so the summary shows it as a skip rather than a hard failure, and the
 * retry step doesn't offer to retry something the user explicitly skipped.
 * A failure the provider left unexplained takes the telling line of what the
 * install printed, when a sink kept it. Whatever the provider did to recover
 * (`recovery`) is said after the message, interrupted or not.
 */
export function finalizeOutcome(outcome: UpdateOutcome): UpdateOutcome {
  const { timedOut, aborted } = consumeInterrupt();
  const failureOutput = consumeFailureOutput();
  if (timedOut) return skippedAs(outcome, INTERRUPT_MESSAGES.timedOut(getInstallTimeoutSeconds()));
  if (aborted) return skippedAs(outcome, INTERRUPT_MESSAGES.manualSkip);
  const reason = outcome.message || unexplainedFailure(outcome, failureOutput);
  const message = messageWithRecovery(reason, outcome.recovery);
  return message === undefined ? outcome : { ...outcome, message };
}

/**
 * Why a failure with no message failed, in the installer's own words: a
 * provider answering `{ success: false }` (most do) would otherwise leave the
 * run view, the journal and the report with a bare "failed".
 */
function unexplainedFailure(
  outcome: UpdateOutcome,
  output: string | undefined,
): string | undefined {
  const isFailure = !outcome.success && outcome.skipped !== true;
  return isFailure && output !== undefined ? tellingLine(output) : undefined;
}

/** `outcome` as a skip for `reason`, its recovery note (if any) after the reason. */
export function skippedAs(outcome: UpdateOutcome, reason: string): UpdateOutcome {
  const message = messageWithRecovery(reason, outcome.recovery) ?? reason;
  return { ...outcome, success: false, skipped: true, retryable: false, message };
}

/** Whether {@link finalizeOutcome} made `outcome` the user's skip. */
export function isManualSkip(outcome: UpdateOutcome): boolean {
  return outcome.message === messageWithRecovery(INTERRUPT_MESSAGES.manualSkip, outcome.recovery);
}

function messageWithRecovery(
  message: string | undefined,
  recovery: string | undefined,
): string | undefined {
  const parts = [message, recovery].filter((part) => part !== undefined && part !== "");
  return parts.length === 0 ? undefined : parts.join(RECOVERY_SEPARATOR);
}

/**
 * Drop any interrupt flag — or failed install's output — left behind by a
 * runInherit call that isn't routed through {@link finalizeOutcome} (e.g. the
 * elevated-batch PowerShell wait), so it can't bleed into the next package's
 * outcome.
 */
export function discardPendingInterrupt(): void {
  consumeInterrupt();
  consumeFailureOutput();
}
