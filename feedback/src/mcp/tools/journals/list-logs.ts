import * as z from "zod";
import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { findInstall } from "../installs/find-install.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { RECORD_JSON } from "./record-json.js";

const PAGE_SIZE = { fallback: 100, max: 500 } as const;
const { logLevels } = JOURNAL_VOCABULARY;

const input = z.strictObject({
  installId: TOOL_INPUTS.installId,
  maxLevel: z.enum(logLevels).default("trace").describe(
    "Most verbose level returned: error gives errors only, warn errors and warnings, … "
    + "trace everything (the default)."),
  query: z.string().max(ADMIN_UI.maxSearchLength).optional().describe(
    "Case-insensitive text found in the event name or in any key or value of the line "
    + "(a package name, an error code). Omit for every line."),
  page: TOOL_INPUTS.page,
  pageSize: TOOL_INPUTS.pageSize(PAGE_SIZE.fallback, PAGE_SIZE.max),
});

async function list(context: ToolContext, args: z.output<typeof input>): Promise<ToolOutput> {
  const { id: installId } = await findInstall(context, args.installId);
  const { page, pageSize, maxLevel } = args;
  const search = args.query?.trim() || null;
  const found = await context.journals.listLogs({
    installId, maxLevelRank: logLevels.indexOf(maxLevel), search, page, pageSize,
  });
  const header = `${found.total} log lines up to ${maxLevel} for ${installId} `
    + `(page ${page}, newest first)`;
  return {
    structured: {
      installId, maxLevel, query: search, page, pageSize, total: found.total,
      items: found.items.map(RECORD_JSON.log),
    },
    text: [header, ...found.items.map(RECORD_JSON.logLine)].join("\n"),
  };
}

export function listLogsTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "list_logs",
    title: "List an install's debug log",
    description: "Lists an install's debug-log lines, newest first, each with its level, "
      + "event name (e.g. update.failed) and full data. Narrow with maxLevel (warn for "
      + "problems only) and a text query; then read the run around a line with get_run.",
    input,
    isReadOnly: true,
    run: (args) => list(context, args),
  };
}
