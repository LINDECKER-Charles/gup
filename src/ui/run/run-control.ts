import { skipCurrent } from "../../core/runner.js";
import type { AbortGate } from "../../core/update/update-ports.js";
import { CTRL_C_DOUBLE_PRESS_MS } from "../skip-controller.js";

/** What a Ctrl+C means: skip the install in flight, or — pressed twice in a row — stop the run. */
export type CtrlCMeaning = "skip" | "stop";

export interface RunControlDeps {
  /** Kill the install in flight; false when nothing interruptible runs. */
  readonly skip: () => boolean;
  readonly clock: () => number;
}

const DEFAULT_DEPS: RunControlDeps = { skip: skipCurrent, clock: Date.now };

/**
 * The run view's levers on the pipeline: it is the run's abort gate (stop:
 * nothing new starts, what is left is cancelled) and it skips the install in
 * flight through the runner, exactly as Ctrl+C does on a plain terminal.
 */
export class RunControl implements AbortGate {
  readonly #deps: RunControlDeps;
  #isAborted = false;
  #lastCtrlC = Number.NEGATIVE_INFINITY;

  constructor(deps: Partial<RunControlDeps> = {}) {
    this.#deps = { ...DEFAULT_DEPS, ...deps };
  }

  isAbortRequested(): boolean {
    return this.#isAborted;
  }

  /** Skip the install in flight; false when there was nothing to interrupt. */
  skip(): boolean {
    return this.#deps.skip();
  }

  /** Stop the run: no new package starts, and the one in flight is interrupted. */
  stop(): void {
    this.#isAborted = true;
    this.#deps.skip();
  }

  /**
   * Stop once the step in flight is over, without interrupting it: the
   * elevated batch runs out of gup's reach (or holds every admin package at
   * once), and killing its waiter would only lose the outcomes.
   */
  stopAfterStep(): void {
    this.#isAborted = true;
  }

  /** Record a Ctrl+C press; a second one within the double-press window means stop. */
  pressCtrlC(): CtrlCMeaning {
    const now = this.#deps.clock();
    const isDouble = now - this.#lastCtrlC < CTRL_C_DOUBLE_PRESS_MS;
    this.#lastCtrlC = now;
    return isDouble ? "stop" : "skip";
  }
}

/** What a run listens to signals on: `process`, or a test's emitter. */
export interface SignalSource {
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

/**
 * The signals that end gup while its screen is up — the same sets as the
 * screen host's (`ui/tui/screen-host.ts`): it releases the screen and exits
 * on them, after skipping the install in flight.
 */
const EXIT_SIGNALS: Readonly<Record<"win32" | "posix", readonly NodeJS.Signals[]>> = {
  win32: ["SIGBREAK", "SIGTERM", "SIGHUP"],
  posix: ["SIGTERM", "SIGHUP", "SIGINT"],
};

/**
 * Close the run's gate when gup is about to end on a signal. The screen host
 * skips the install in flight and tears the screen down before exiting, which
 * takes a few event-loop turns; without this, the pipeline would start the
 * next package meanwhile. Returns the release (idempotent).
 */
export function closeOnExitSignals(
  control: RunControl,
  source: SignalSource = process,
  platform: NodeJS.Platform = process.platform,
): () => void {
  const signals = EXIT_SIGNALS[platform === "win32" ? "win32" : "posix"];
  const close = (): void => control.stopAfterStep();
  for (const signal of signals) source.on(signal, close);
  let isReleased = false;
  return () => {
    if (isReleased) return;
    isReleased = true;
    for (const signal of signals) source.off(signal, close);
  };
}
