import { RUN_NOTICES } from "../text/run-key-labels.js";
import type { ElevationKind } from "../text/run-labels.js";
import type { RunControl } from "./run-control.js";
import type { RunDialogs } from "./run-dialogs.js";
import type { Notice } from "./run-lines.js";
import type { RunModel } from "./run-model.js";
import type { TerminalPanes } from "./terminal/terminal-panes.js";

export interface RunLeverDeps {
  readonly model: RunModel;
  readonly control: RunControl;
  readonly panes: TerminalPanes;
  readonly dialogs: RunDialogs;
  readonly elevation: ElevationKind;
  /** Put a notice under the progress line. */
  readonly say: (text: string, tone: Notice["tone"]) => void;
  readonly redraw: () => void;
}

/**
 * The user's levers on a run in flight — `s` skips the package, `x` stops
 * everything once confirmed, Ctrl+C skips and twice stops, `t` gives the
 * installer the keyboard — and what each one says. The elevated step only
 * ends early: its installers run as one batch, in a window of their own
 * on Windows.
 */
export class RunLevers {
  readonly #deps: RunLeverDeps;

  constructor(deps: RunLeverDeps) {
    this.#deps = deps;
  }

  /** `s`. */
  skip(): void {
    const { model, elevation, say } = this.#deps;
    if (model.phase === "elevating") return say(RUN_NOTICES.skipAdmin[elevation], "warning");
    this.skipWith(RUN_NOTICES.skipped);
  }

  /** The screen's Ctrl+C while packages install: skip; twice in a row, stop the run. */
  ctrlC(): void {
    const { control, model, elevation, say } = this.#deps;
    if (control.pressCtrlC() === "stop") this.stopNow(RUN_NOTICES.ctrlCDouble);
    else if (model.phase === "elevating") say(RUN_NOTICES.skipAdmin[elevation], "warning");
    else this.skipWith(RUN_NOTICES.ctrlCFirst);
  }

  /** `x`: after a confirmation — or at once during the elevated step, which only ends early. */
  async stop(): Promise<void> {
    const { model, dialogs, redraw } = this.#deps;
    if (model.isStopping) return;
    if (model.phase === "elevating") return this.stopNow(RUN_NOTICES.stopAfterStep);
    if (!(await dialogs.confirmStop(model.remaining()))) return;
    if (model.phase !== "done") this.stopNow(RUN_NOTICES.ctrlCDouble);
    redraw();
  }

  /** `t`: the installer in flight gets the keyboard, unless it runs in a window of its own. */
  focus(): void {
    const { model, panes, elevation, say } = this.#deps;
    const isUacStep = model.phase === "elevating" && elevation === "uac";
    if (isUacStep) return say(RUN_NOTICES.typeElsewhere, "warning");
    if (!panes.focus()) say(RUN_NOTICES.typeIdle, "muted");
  }

  private skipWith(notice: string): void {
    const { control, say } = this.#deps;
    if (control.skip()) say(notice, "warning");
    else say(RUN_NOTICES.skipIdle, "muted");
  }

  private stopNow(notice: string): void {
    const { control, model, say } = this.#deps;
    if (model.phase === "elevating") {
      control.stopAfterStep();
      say(RUN_NOTICES.stopAfterStep, "danger");
    } else {
      control.stop();
      say(notice, "danger");
    }
    model.markStopping();
  }
}
