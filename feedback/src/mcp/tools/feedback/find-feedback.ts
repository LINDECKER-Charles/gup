import type { Feedback } from "../../../domain/feedback.js";
import { ToolFailure } from "../tool-failure.js";
import type { ToolContext } from "../tool-spec.js";

/** The feedback, or the tool error a model can act on. */
export async function findFeedback(context: ToolContext, id: number): Promise<Feedback> {
  const feedback = await context.feedback.find(id);
  if (feedback === null) throw new ToolFailure(`No feedback #${id}.`);
  return feedback;
}
