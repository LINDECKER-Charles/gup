import { log } from "../../core/log/log.js";
import { TICK_COMMAND } from "../../core/scheduler/trigger/task-command.js";
import { FEEDBACK_CLI_LABELS as LABELS } from "../../ui/text/feedback/feedback-cli-labels.js";
import { PromptCancelledError } from "../../ui/tui/prompt-cancelled.js";
import type { DiagnosticLine, StartupContext } from "../cli/cli-module.js";
import { shouldAskConsent } from "./consent.js";
import type { SharingControl } from "./sharing-control.js";

/**
 * What feedback does around every command: the one-time question about
 * sharing the journals (before the menu, `update` or `list`), the upload of
 * the journals once the command is done — after any erasure the menu
 * started — and the `gup doctor` line, which only reads. The upload itself
 * keeps to a weekly cadence (`SharingControl.upload`): most runs end without
 * sending anything.
 */

export interface FeedbackLifecycleDeps {
  readonly sharing: () => SharingControl;
  readonly env: NodeJS.ProcessEnv;
  readonly canPrompt: () => boolean;
  /** The consent question: true for yes; Ctrl+C rejects with PromptCancelledError. */
  readonly ask: () => Promise<boolean>;
  /** Pending work is abandoned past this, whatever it is doing: the process exits. */
  readonly deadlineMs: number;
}

/**
 * The commands that write the journals, after which a sync is attempted.
 * Any other command attempts one only when it opened the feedback form
 * (`SharingControl.requestSync`): `gup feedback`.
 */
const UPLOADING_COMMANDS: ReadonlySet<string> = new Set([
  "",
  "update",
  "list",
  "schedule run-now",
  TICK_COMMAND,
]);

export class FeedbackLifecycle {
  readonly #deps: FeedbackLifecycleDeps;

  constructor(deps: FeedbackLifecycleDeps) {
    this.#deps = deps;
  }

  /**
   * Ask whether to share, when {@link shouldAskConsent} allows it, and save
   * the answer. Escape answers no and the command goes on; Ctrl+C saves the
   * no, then ends the run like every other prompt (exit 130). Any other
   * failure leaves the question for next time.
   */
  async askConsentOnce(context: StartupContext): Promise<void> {
    const sharing = this.#deps.sharing();
    const isAsked = shouldAskConsent({
      ...context,
      env: this.#deps.env,
      state: sharing.state(),
      canPrompt: this.#deps.canPrompt(),
      canKeepAnswer: sharing.canKeepAnswer(),
    });
    if (!isAsked) return;
    let isGranted: boolean;
    try {
      isGranted = await this.#deps.ask();
    } catch (error) {
      if (error instanceof PromptCancelledError) {
        save(sharing, "denied");
        throw error;
      }
      log.warn("sharing.consent-failed", { error });
      return;
    }
    save(sharing, isGranted ? "granted" : "denied");
  }

  /**
   * Finish an erasure in flight, then upload after a command that wrote the
   * journals or opened the feedback form.
   */
  async afterCommand(context: StartupContext): Promise<void> {
    const sharing = this.#deps.sharing();
    const work = (async () => {
      await sharing.settled();
      const isUploading = UPLOADING_COMMANDS.has(context.commandPath);
      if (isUploading || sharing.isSyncRequested()) await sharing.upload();
    })();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.#deps.deadlineMs);
      timer.unref();
    });
    await Promise.race([work, deadline]);
    clearTimeout(timer);
  }

  /** The `gup doctor` line: the decision in effect and the install ID, without creating it. */
  diagnostic(): DiagnosticLine {
    const sharing = this.#deps.sharing();
    const state = sharing.state();
    const stateLabel = LABELS.states[state];
    const installId = sharing.installId();
    return {
      label: LABELS.diagnosticLabel,
      value:
        installId === null
          ? LABELS.diagnosticNoId(stateLabel)
          : LABELS.diagnosticValue(stateLabel, installId),
      status: state === "granted" ? "ok" : "off",
    };
  }
}

function save(sharing: SharingControl, decision: "granted" | "denied"): void {
  try {
    sharing.decide(decision);
  } catch (error) {
    // The question comes back next time; the command the user started goes on.
    log.warn("sharing.consent-failed", { error });
  }
}
