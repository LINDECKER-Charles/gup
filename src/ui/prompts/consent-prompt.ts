import { CONSENT_LABELS as LABELS } from "../text/feedback/consent-labels.js";
import { DIALOG_LABELS } from "../text/menu-labels.js";
import { PromptCancelledError } from "../tui/prompt-cancelled.js";
import type { ScreenHost } from "../tui/screen-host.js";
import { printAnswer, withDialog } from "./dialog-screen.js";

/**
 * Ask, once, whether this install may share its journals. "No" is the
 * highlighted button and Escape answers no: a user who brushes the question
 * off has not agreed to anything, and the command they started goes on.
 * Ctrl+C leaves the "no" on the scrollback, then rejects with
 * PromptCancelledError as every prompt does: the caller saves the no and
 * ends the run. The install ID is not shown: it is created only on a yes.
 */
export async function askSharingConsent(host?: ScreenHost): Promise<boolean> {
  const text = [LABELS.what, "", LABELS.never, LABELS.change, "", LABELS.question];
  const no = DIALOG_LABELS.answeredNo;
  let isGranted: boolean;
  try {
    isGranted = await withDialog(
      (dialogs) => dialogs.confirm({ title: LABELS.title, text, default: false }),
      host,
    );
  } catch (error) {
    if (error instanceof PromptCancelledError) printAnswer(LABELS.question, no);
    throw error;
  }
  printAnswer(LABELS.question, isGranted ? DIALOG_LABELS.answeredYes : no);
  return isGranted;
}
