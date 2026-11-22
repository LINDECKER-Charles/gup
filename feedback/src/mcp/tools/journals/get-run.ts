import * as z from "zod";
import type { RunSummary } from "../../../ports/install-reader.js";
import { findInstall } from "../installs/find-install.js";
import { ToolFailure } from "../tool-failure.js";
import { TOOL_INPUTS } from "../tool-inputs.js";
import type { ToolContext, ToolOutput, ToolSpec } from "../tool-spec.js";
import { RECORD_JSON } from "./record-json.js";

const PAGE_SIZE = { fallback: 200, max: 500 } as const;

const input = z.strictObject({
  installId: TOOL_INPUTS.installId,
  runId: TOOL_INPUTS.runId,
  page: TOOL_INPUTS.page,
  pageSize: TOOL_INPUTS.pageSize(PAGE_SIZE.fallback, PAGE_SIZE.max),
});

function summaryJson(run: RunSummary) {
  return { ...run, startedAt: run.startedAt.toISOString(), endedAt: run.endedAt.toISOString() };
}

function summaryLine(run: RunSummary): string {
  return `run ${run.runId} from ${run.startedAt.toISOString()} to ${run.endedAt.toISOString()}: `
    + `${run.historyCount} history, ${run.logCount} logs, ${run.errorCount} errors, `
    + `${run.failedUpdateCount} failed updates`;
}

async function get(context: ToolContext, args: z.output<typeof input>): Promise<ToolOutput> {
  const { id: installId } = await findInstall(context, args.installId);
  const key = { installId, runId: args.runId };
  const run = await context.journals.findRun(key);
  if (run === null) {
    throw new ToolFailure(`Install ${installId} holds no record of run ${key.runId}.`);
  }
  const { page, pageSize } = args;
  const entries = await context.journals.listRun({ ...key, page, pageSize });
  return {
    structured: {
      run: summaryJson(run), page, pageSize, total: entries.total,
      items: entries.items.map(RECORD_JSON.entry),
    },
    text: [`${summaryLine(run)} (page ${page})`, ...entries.items.map(RECORD_JSON.entryLine)]
      .join("\n"),
  };
}

export function getRunTool(context: ToolContext): ToolSpec<typeof input> {
  return {
    name: "get_run",
    title: "Get one run",
    description: "Tells one gup run (one invocation, by its runId) of an install: its time "
      + "span and counts, then its history items and log lines merged in chronological "
      + "order (oldest first), each with its full data. The way to read what happened "
      + "around a failure found with list_history or list_logs.",
    input,
    isReadOnly: true,
    run: (args) => get(context, args),
  };
}
