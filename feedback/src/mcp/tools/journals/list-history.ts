import * as z from "zod";
import { FIELD_RULES } from "../../../domain/field-rules.js";
import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import { findInstall } from "../installs/find-install.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { RECORD_JSON } from "./record-json.js";

const PAGE_SIZE = { fallback: 50, max: 500 } as const;

const input = z.strictObject({
  installId: TOOL_INPUTS.installId,
  kind: z.enum(JOURNAL_VOCABULARY.historyKinds).optional()
    .describe("Only scans or only updates. Omit for both."),
  status: z.string().min(1).max(FIELD_RULES.updateStatus.max).optional()
    .describe("Only update records with this status, e.g. failed, success, skipped."),
  page: TOOL_INPUTS.page,
  pageSize: TOOL_INPUTS.pageSize(PAGE_SIZE.fallback, PAGE_SIZE.max),
});

async function list(context: ToolContext, args: z.output<typeof input>): Promise<ToolOutput> {
  const { id: installId } = await findInstall(context, args.installId);
  const { page, pageSize } = args;
  const found = await context.journals.listHistory({
    installId, kind: args.kind ?? null, status: args.status ?? null, page, pageSize,
  });
  const header = `${found.total} history items for ${installId} (page ${page}, newest first)`;
  return {
    structured: {
      installId, page, pageSize, total: found.total, items: found.items.map(RECORD_JSON.history),
    },
    text: [header, ...found.items.map(RECORD_JSON.historyLine)].join("\n"),
  };
}

export function listHistoryTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "list_history",
    title: "List an install's history",
    description: "Lists an install's history records, newest first, each with its full data "
      + "as the CLI recorded it: scans (what was found outdated) and updates (package, "
      + "versions, status, error). Filter on kind and status, e.g. kind update and status "
      + "failed for the failures; then read the run around one with get_run.",
    input,
    isReadOnly: true,
    run: (args) => list(context, args),
  };
}
