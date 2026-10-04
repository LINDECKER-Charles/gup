import type {
  AbortGate,
  RetryRequest,
  RetryStrategyId,
  UpdateDecisions,
} from "../../core/update/update-ports.js";
import { describeRetryables, retryChoices, type RetryAnswer } from "../retry-choices.js";
import {
  ELEVATE_DIALOG,
  RETRY_DIALOG,
  STOP_DIALOG,
  type ElevationKind,
} from "../text/run-labels.js";
import type { DialogLayer } from "../tui/dialog.js";

/** What must not take keys while a dialog is open: the terminal panes. */
export interface InputLock {
  lock(): () => void;
}

export interface RunDialogsContext {
  readonly panes: InputLock;
  readonly gate: AbortGate;
  readonly elevation: ElevationKind;
}

/**
 * The run's questions, asked as dialogs over the run view: the pipeline's
 * decisions (elevation, retry strategy) and the view's own stop confirmation.
 *
 * One dialog at a time: the dialog layer holds a single active box, and the
 * pipeline may ask its next question while the user still reads the stop
 * confirmation — the question then waits its turn. A question whose turn
 * comes after the user stopped the run is answered "no" without being shown.
 * While any dialog is open the terminal panes take no key and no click
 * (IT-5), so Enter on a dialog can never also reach an installer.
 */
export class RunDialogs implements UpdateDecisions {
  readonly #dialogs: DialogLayer;
  readonly #context: RunDialogsContext;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(dialogs: DialogLayer, context: RunDialogsContext) {
    this.#dialogs = dialogs;
    this.#context = context;
  }

  confirmElevation(count: number): Promise<boolean> {
    return this.ask(false, () =>
      this.#dialogs.confirm({
        title: ELEVATE_DIALOG.title,
        text: [ELEVATE_DIALOG.text[this.#context.elevation](count)],
        default: true,
      }),
    );
  }

  async chooseRetry(request: RetryRequest): Promise<RetryStrategyId | null> {
    const answer = await this.ask<RetryAnswer | undefined>(undefined, () =>
      this.#dialogs.choose<RetryAnswer>({
        title: RETRY_DIALOG.title,
        text: [describeRetryables(request.failures)],
        choices: retryChoices(request.strategies),
        default: "none",
      }),
    );
    return answer === undefined || answer === "none" ? null : answer;
  }

  /** "Stop all?" — `remaining` packages would be cancelled. Defaults to no. */
  confirmStop(remaining: number): Promise<boolean> {
    return this.exclusive(() =>
      this.#dialogs.confirm({
        title: STOP_DIALOG.title,
        text: [STOP_DIALOG.text(remaining)],
        default: false,
      }),
    );
  }

  /** A pipeline question: `stopped` answers it once the run was stopped. */
  private ask<T>(stopped: T, open: () => Promise<T>): Promise<T> {
    return this.exclusive(() =>
      this.#context.gate.isAbortRequested() ? Promise.resolve(stopped) : open(),
    );
  }

  /** Run `open` once every dialog before it closed, with the panes locked. */
  private exclusive<T>(open: () => Promise<T>): Promise<T> {
    const turn = this.#queue.then(async () => {
      const release = this.#context.panes.lock();
      try {
        return await open();
      } finally {
        release();
      }
    });
    this.#queue = turn.catch(() => undefined);
    return turn;
  }
}
