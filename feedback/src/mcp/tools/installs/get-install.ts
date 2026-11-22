import * as z from "zod";
import type { Feedback } from "../../../domain/feedback.js";
import type { HistoryBreakdownCell, JournalSpan } from "../../../ports/install-reader.js";
import { FEEDBACK_JSON } from "../feedback/feedback-json.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { findInstall } from "./find-install.js";
import { INSTALL_JSON } from "./install-json.js";

const input = z.strictObject({ installId: TOOL_INPUTS.installId });

function isoOrNull(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

function spanJson(span: JournalSpan) {
  return {
    oldestAt: isoOrNull(span.oldestAt),
    newestAt: isoOrNull(span.newestAt),
    oldestReceivedAt: isoOrNull(span.oldestReceivedAt),
    runCount: span.runCount,
  };
}

function breakdownLine(cells: readonly HistoryBreakdownCell[]): string {
  const parts = cells.map((cell) =>
    `${cell.kind}${cell.status === null ? "" : ` ${cell.status}`} ${cell.count}`);
  return `history: ${parts.join(", ") || "none"}`;
}

/** The feedback that gave this install ID; null when the access may not read feedback. */
async function linkedFeedback(context: ToolContext, installId: string) {
  if (!context.permissions.has("feedback:read")) return null;
  return context.feedback.listByInstall(installId);
}

function feedbackLines(linked: readonly Feedback[] | null): string[] {
  if (linked === null) return ["feedback: outside this access's permissions (feedback:read)"];
  return [`feedback: ${linked.length === 0 ? "none" : ""}`, ...linked.map(FEEDBACK_JSON.line)];
}

async function get(context: ToolContext, installId: string): Promise<ToolOutput> {
  const install = await findInstall(context, installId);
  const { journals } = context;
  const [breakdown, span, linked] = await Promise.all([
    journals.historyBreakdown(install.id),
    journals.journalSpan(install.id),
    linkedFeedback(context, install.id),
  ]);
  const journal = spanJson(span);
  return {
    structured: {
      install: INSTALL_JSON.summary(install), historyBreakdown: breakdown,
      journalSpan: journal, feedback: linked?.map(FEEDBACK_JSON.summary) ?? null,
    },
    text: [
      INSTALL_JSON.line(install), breakdownLine(breakdown),
      `records from ${journal.oldestAt ?? "?"} to ${journal.newestAt ?? "?"} over `
        + `${journal.runCount} runs; oldest received ${journal.oldestReceivedAt ?? "?"}`,
      ...feedbackLines(linked),
    ].join("\n"),
  };
}

export function getInstallTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "get_install",
    title: "Get one install",
    description: "Returns one install that shared its journals: its summary, the count of "
      + "history items per kind and status (e.g. update failed 3), the time span and number "
      + "of runs its records cover (the oldest received is purged first), and the feedback "
      + "that gave its install ID (null when this access may not read feedback). Follow up "
      + "with list_history, list_logs or get_run.",
    input,
    isReadOnly: true,
    run: ({ installId }) => get(context, installId),
  };
}
