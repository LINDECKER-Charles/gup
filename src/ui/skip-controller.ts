import chalk from "chalk";
import { getInstallTimeoutSeconds, skipCurrent } from "../core/runner.js";

/**
 * Interactive "skip" layer for update batches on a plain terminal.
 *
 * Two complementary levers keep a wedged install from blocking the whole run:
 * - automatic: the runner kills any install that exceeds the wall-clock
 *   timeout (see runner.ts) — the pipeline then reports a SKIP outcome
 *   (core/update/finalize-outcome.ts);
 * - manual: Ctrl+C skips the install in flight and lets the batch continue;
 *   a second Ctrl+C within {@link CTRL_C_DOUBLE_PRESS_MS} stops the whole batch.
 *
 * A SIGINT listener (instead of letting Node exit) is what turns Ctrl+C into a
 * skip rather than a hard kill of gup. The session is only live around the
 * update loop, so prompts (confirm/select) keep their normal Ctrl+C = exit.
 * A session is the pipeline's abort gate.
 */

/** Two Ctrl+C within this window stop the batch — in the console and in the run view alike. */
export const CTRL_C_DOUBLE_PRESS_MS = 1500;

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
    const isDouble = now - lastPress < CTRL_C_DOUBLE_PRESS_MS;
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
