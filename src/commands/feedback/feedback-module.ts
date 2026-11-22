import { openWebPage } from "../../core/export/open-external.js";
import { UPLOAD_LIMITS } from "../../core/feedback/journal-uploader.js";
import { isCiRun } from "../../core/state/ci-run.js";
import { askSharingConsent } from "../../ui/prompts/consent-prompt.js";
import { canPrompt } from "../../ui/tui/screen-host.js";
import { MODULE_ORDER, type CliModule } from "../cli/cli-module.js";
import { FeedbackCommands } from "./feedback-commands.js";
import { FeedbackLifecycle } from "./feedback-lifecycle.js";
import { processSharing } from "./process-sharing.js";

/**
 * Feedback on the command line: `gup feedback …`, the one-time question
 * about sharing the journals, their upload once the command that wrote them
 * is done, and the `gup doctor` line. The elevated child runs none of it.
 */

/** Room past the uploader's own budget for reading the journals. */
const DEADLINE_GRACE_MS = 1_000;

const commands = new FeedbackCommands({
  sharing: processSharing,
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
  openPage: (url) => openWebPage(url),
  isWatched: () => process.stdout.isTTY === true && !isCiRun(),
});

const lifecycle = new FeedbackLifecycle({
  sharing: processSharing,
  env: process.env,
  canPrompt,
  ask: () => askSharingConsent(),
  deadlineMs: UPLOAD_LIMITS.budgetMs + DEADLINE_GRACE_MS,
});

export const feedbackModule: CliModule = {
  id: "feedback",
  order: MODULE_ORDER.commands,
  register: (program) => commands.register(program),
  beforeAction: (context) => lifecycle.askConsentOnce(context),
  beforeExit: (context) => lifecycle.afterCommand(context),
  diagnostics: async () => [lifecycle.diagnostic()],
};
