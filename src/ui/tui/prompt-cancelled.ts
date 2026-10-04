import { SCREEN_ERRORS } from "../text/menu-labels.js";

/**
 * The user pressed Ctrl+C while a prompt or a live view owned the keyboard.
 *
 * While OpenTUI holds the terminal in raw mode, Ctrl+C arrives as a key, not
 * as SIGINT, so it has to be turned back into "stop" explicitly. The CLI entry
 * point maps this error to exit code 130, like a signal-terminated process.
 */
export class PromptCancelledError extends Error {
  override readonly name = "PromptCancelledError";

  constructor() {
    super(SCREEN_ERRORS.cancelled);
  }
}
