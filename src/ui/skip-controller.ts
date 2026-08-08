import chalk from "chalk";
import {
  consumeInterrupt,
  getInstallTimeoutSeconds,
  skipCurrent,
} from "../core/runner.js";
import type { UpdateOutcome } from "../core/types.js";

/**
 * Interactive "skip" layer for update batches.
 *
 * Two complementary levers keep a wedged install from blocking the whole run:
 * - automatic: the runner kills any install that exceeds the wall-clock
 *   timeout (see runner.ts) — surfaced here as a SKIP outcome;
 * - manual: Ctrl+C skips the install in flight and lets the batch continue;
 *   a second Ctrl+C within {@link DOUBLE_PRESS_MS} stops the whole batch.
 *
 * A SIGINT listener (instead of letting Node exit) is what turns Ctrl+C into a
 * skip rather than a hard kill of gup. The session is only live around the
 * update loop, so prompts (confirm/select) keep their normal Ctrl+C = exit.
 */

const DOUBLE_PRESS_MS = 1500;

interface ActiveSession {
  abortRequested: boolean;
  dispose(): void;
}

// Process-wide single active session: updates never run concurrently, so one
// SIGINT handler at a time is enough. Nested begins share the outer session.
let active: ActiveSession | null = null;

export interface SkipSession {
  /** True once the user asked to stop the whole batch (Ctrl+C ×2). */
  isAbortRequested(): boolean;
  /** Remove the SIGINT handler. Idempotent; no-op for a nested (shared) begin. */
  dispose(): void;
}

export function beginSkipSession(): SkipSession {
  if (active) {
    // Re-entrant: an outer session already owns the SIGINT handler.
    const outer = active;
    return { isAbortRequested: () => outer.abortRequested, dispose: () => {} };
  }

  const session: ActiveSession = {
    abortRequested: false,
    dispose() {
      process.removeListener("SIGINT", onSigint);
      if (active === session) active = null;
    },
  };
  const onSigint = makeSigintHandler(session);

  process.on("SIGINT", onSigint);
  active = session;
  printHint();
  return {
    isAbortRequested: () => session.abortRequested,
    dispose: () => session.dispose(),
  };
}

/** Per-session SIGINT handler — it carries its own timestamp. */
function makeSigintHandler(session: ActiveSession): () => void {
  let lastPress = 0;
  return (): void => {
    const now = Date.now();
    const isDouble = now - lastPress < DOUBLE_PRESS_MS;
    lastPress = now;
    // A single press with an install in flight only skips that package; a
    // double press, or a press with nothing running, stops the whole batch.
    if (announceInterrupt(isDouble, skipCurrent())) session.abortRequested = true;
  };
}

/**
 * Write the message matching the Ctrl+C received. Returns true when the
 * interrupt should stop the whole batch, false when it only skips the install
 * currently running.
 */
function announceInterrupt(isDouble: boolean, skipped: boolean): boolean {
  if (isDouble) {
    process.stdout.write(
      chalk.red("\n  arrêt demandé — fin du paquet en cours puis stop\n"),
    );
    return true;
  }
  if (skipped) {
    process.stdout.write(
      chalk.yellow(
        "\n  skip de l'install en cours… (Ctrl+C ×2 pour tout arrêter)\n",
      ),
    );
    return false;
  }
  // No install running (between packages / during a prompt) — treat the
  // keypress as intent to stop the batch.
  process.stdout.write(chalk.red("\n  arrêt demandé…\n"));
  return true;
}

function printHint(): void {
  const timeout = getInstallTimeoutSeconds();
  const timeoutLabel =
    timeout > 0 ? `timeout auto ${timeout}s` : "timeout auto désactivé";
  process.stdout.write(
    chalk.dim(
      `  Ctrl+C : passer l'install bloquée · Ctrl+C ×2 : tout arrêter · ${timeoutLabel}\n`,
    ),
  );
}

/** True if a skip session is active and the user requested a full abort. */
export function isAbortRequested(): boolean {
  return active?.abortRequested ?? false;
}

/**
 * Rewrite an interrupted outcome (manual skip or timeout) as a deliberate
 * SKIP so the summary shows it as a skip rather than a hard failure, and the
 * retry prompt doesn't offer to retry something the user explicitly skipped.
 * Pass-through when the run completed normally.
 */
export function finalizeOutcome(outcome: UpdateOutcome): UpdateOutcome {
  const { timedOut, aborted } = consumeInterrupt();
  if (timedOut) {
    return {
      ...outcome,
      success: false,
      skipped: true,
      retryable: false,
      message: `timeout (${getInstallTimeoutSeconds()}s) — install ignorée`,
    };
  }
  if (aborted) {
    return {
      ...outcome,
      success: false,
      skipped: true,
      retryable: false,
      message: "ignorée (Ctrl+C)",
    };
  }
  return outcome;
}

/**
 * Drop any interrupt flag left behind by a runInherit call that isn't routed
 * through {@link finalizeOutcome} (e.g. the elevated-batch PowerShell wait), so
 * a stale flag can't bleed into the next package's outcome.
 */
export function discardPendingInterrupt(): void {
  consumeInterrupt();
}
