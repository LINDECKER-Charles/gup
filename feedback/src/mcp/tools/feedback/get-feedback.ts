import * as z from "zod";
import type { Feedback } from "../../../domain/feedback.js";
import { INSTALL_JSON } from "../installs/install-json.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { FEEDBACK_JSON } from "./feedback-json.js";
import { findFeedback } from "./find-feedback.js";

const input = z.strictObject({ id: TOOL_INPUTS.feedbackId });

/** Said in place of the journals' summary when the access may not read journals. */
const JOURNALS_WITHHELD = "outside this access's permissions (journals:read)";

function render(feedback: Feedback, installLine: string): string {
  return [
    FEEDBACK_JSON.line(feedback),
    `email: ${feedback.email ?? "none"}; gup ${feedback.gupVersion ?? "?"}; `
      + `platform ${feedback.platform ?? "?"}; locale ${feedback.locale ?? "?"}`,
    `shared journals: ${installLine}`,
    "message:", feedback.message,
    `note: ${feedback.note === "" ? "none" : feedback.note}`,
  ].join("\n");
}

async function get(context: ToolContext, id: number): Promise<ToolOutput> {
  const feedback = await findFeedback(context, id);
  const { installId } = feedback;
  if (!context.permissions.has("journals:read")) {
    return {
      structured: { feedback: FEEDBACK_JSON.full(feedback), install: null },
      text: render(feedback, JOURNALS_WITHHELD),
    };
  }
  const install = installId === null ? null : await context.journals.find(installId);
  const { permissions } = context;
  return {
    structured: {
      feedback: FEEDBACK_JSON.full(feedback),
      install: install === null ? null : INSTALL_JSON.summary(install, permissions),
    },
    text: render(feedback, install === null ? "none" : INSTALL_JSON.line(install, permissions)),
  };
}

export function getFeedbackTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "get_feedback",
    title: "Get one feedback",
    description: "Returns one feedback in full: message, reporter's address, gup version, "
      + "platform, triage status, the maintainer's private note, and the summary of the "
      + "install's shared journals when the reporter gave an install ID that shared them "
      + "and this access may read journals (install is null otherwise). Follow up with "
      + "get_install, list_history or list_logs.",
    input,
    isReadOnly: true,
    run: ({ id }) => get(context, id),
  };
}
