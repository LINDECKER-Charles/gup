import * as z from "zod";
import { FEEDBACK_VOCABULARY } from "../../../domain/feedback.js";
import { isPlainText } from "../../../security/is-plain-text.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { ToolFailure } from "../tool-failure.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { FEEDBACK_JSON } from "./feedback-json.js";
import { findFeedback } from "./find-feedback.js";

const input = z.strictObject({
  id: TOOL_INPUTS.feedbackId,
  status: z.enum(FEEDBACK_VOCABULARY.statuses).optional()
    .describe("New triage status; any transition is allowed."),
  note: z.string().max(ADMIN_UI.maxNoteLength).optional().describe(
    "Replaces the private note (trimmed; an empty string clears it). The reporter never "
    + "sees it. Read the current note with get_feedback first to amend rather than replace."),
});

/** The back office's rules for a note: plain text, trimmed. */
function readNote(note: string | undefined): string | null {
  if (note === undefined) return null;
  if (!isPlainText(note)) throw new ToolFailure("The note holds control characters.");
  return note.trim();
}

async function update(context: ToolContext, args: z.output<typeof input>): Promise<ToolOutput> {
  const note = readNote(args.note);
  if (args.status === undefined && note === null) {
    throw new ToolFailure("Nothing to change: give a status, a note or both.");
  }
  const { id } = await findFeedback(context, args.id);
  if (args.status !== undefined) await context.feedback.updateStatus(id, args.status);
  if (note !== null) await context.feedback.updateNote(id, note);
  const updated = await findFeedback(context, id);
  return {
    structured: { feedback: FEEDBACK_JSON.full(updated) },
    text: `Updated: ${FEEDBACK_JSON.line(updated)}\nnote: ${updated.note || "none"}`,
  };
}

export function updateFeedbackTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "update_feedback",
    title: "Triage one feedback",
    description: "Sets the triage status of a feedback (new, in_progress, resolved, dismissed) "
      + "and/or replaces its private note. The only write this server offers: it never "
      + "deletes feedback nor erases journals. Returns the updated feedback.",
    input,
    isReadOnly: false,
    run: (args) => update(context, args),
  };
}
