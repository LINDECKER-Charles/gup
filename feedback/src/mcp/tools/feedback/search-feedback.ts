import * as z from "zod";
import { FEEDBACK_VOCABULARY } from "../../../domain/feedback.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { FEEDBACK_JSON } from "./feedback-json.js";

const PAGE_SIZE = { fallback: 20, max: 100 } as const;

const input = z.strictObject({
  query: z.string().max(ADMIN_UI.maxSearchLength).optional().describe(
    "Case-insensitive text found in the title, the message, the reporter's address or the "
    + "install ID; or a feedback number (42 or #42). Omit to list everything."),
  status: z.enum(FEEDBACK_VOCABULARY.statuses).optional()
    .describe("Only this triage status. Omit for every status."),
  kind: z.enum(FEEDBACK_VOCABULARY.kinds).optional().describe("Only bugs or only suggestions."),
  page: TOOL_INPUTS.page,
  pageSize: TOOL_INPUTS.pageSize(PAGE_SIZE.fallback, PAGE_SIZE.max),
});

/** The inbox's rule: spaces collapsed and trimmed, nothing left = no search. */
function normalise(query: string | undefined): string | null {
  const search = (query ?? "").replace(/\s+/g, " ").trim();
  return search === "" ? null : search;
}

async function search(context: ToolContext, args: z.output<typeof input>): Promise<ToolOutput> {
  const { status, page, pageSize } = args;
  const filter = { kind: args.kind ?? null, search: normalise(args.query) };
  const [counts, found] = await Promise.all([
    context.feedback.countByStatus(filter),
    context.feedback.list({ ...filter, status: status ?? null, page, pageSize }),
  ]);
  const byStatus = Object.entries(counts).map(([name, count]) => `${name} ${count}`).join(", ");
  const header = `${found.total} feedback match (page ${page}); by status: ${byStatus}`;
  return {
    structured: {
      total: found.total, page, pageSize, countsByStatus: counts,
      items: found.items.map(FEEDBACK_JSON.summary),
    },
    text: [header, ...found.items.map(FEEDBACK_JSON.line)].join("\n"),
  };
}

export function searchFeedbackTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "search_feedback",
    title: "Search feedback",
    description: "Lists feedback (bug reports and suggestions sent from the gup landing page), "
      + "newest first, with the total and the count per triage status under the same query "
      + "and kind. Items carry a message preview; call get_feedback for the full message, "
      + "the reporter's address and the private note.",
    input,
    isReadOnly: true,
    run: (args) => search(context, args),
  };
}
