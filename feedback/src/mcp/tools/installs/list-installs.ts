import * as z from "zod";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { INSTALL_JSON } from "./install-json.js";

const PAGE_SIZE = { fallback: 20, max: 100 } as const;

const input = z.strictObject({
  page: TOOL_INPUTS.page,
  pageSize: TOOL_INPUTS.pageSize(PAGE_SIZE.fallback, PAGE_SIZE.max),
});

async function list(context: ToolContext, args: z.output<typeof input>): Promise<ToolOutput> {
  const found = await context.journals.list(args);
  const header = `${found.total} installs shared journals (page ${args.page})`;
  return {
    structured: { ...args, total: found.total, items: found.items.map(INSTALL_JSON.summary) },
    text: [header, ...found.items.map(INSTALL_JSON.line)].join("\n"),
  };
}

export function listInstallsTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "list_installs",
    title: "List installs with shared journals",
    description: "Lists the gup installs that shared their journals, most recent upload "
      + "first: install ID, gup version, platform, first and last upload, and how many "
      + "history items, log lines and feedback each holds.",
    input,
    isReadOnly: true,
    run: (args) => list(context, args),
  };
}
