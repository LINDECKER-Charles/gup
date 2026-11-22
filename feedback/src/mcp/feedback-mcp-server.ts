import { McpServer } from "@modelcontextprotocol/server";
import { getFeedbackTool } from "./tools/feedback/get-feedback.js";
import { searchFeedbackTool } from "./tools/feedback/search-feedback.js";
import { updateFeedbackTool } from "./tools/feedback/update-feedback.js";
import { getInstallTool } from "./tools/installs/get-install.js";
import { listInstallsTool } from "./tools/installs/list-installs.js";
import { getRunTool } from "./tools/journals/get-run.js";
import { listHistoryTool } from "./tools/journals/list-history.js";
import { listLogsTool } from "./tools/journals/list-logs.js";
import { registerTool } from "./tools/register-tool.js";
import type { ToolContext } from "./tools/tool-spec.js";

const SERVER_INFO = { name: "gup-feedback", version: "1.0.0" } as const;

/** What a model needs to know before its first call. */
const INSTRUCTIONS = [
  "The gup feedback service: what users of the gup CLI (a Windows/macOS/Linux updater) sent.",
  "Feedback = a bug report or a suggestion from the landing page, numbered (#42), with a "
    + "triage status (new, in_progress, resolved, dismissed) and a private maintainer note.",
  "Install = one gup installation that agreed to share its journals, identified by a UUID v4 "
    + "install ID. A reporter may paste it in a feedback, which links the two.",
  "Journals: history items (kind scan or update; an update has a status such as success, "
    + "failed or skipped) and debug-log lines (level error < warn < info < debug < trace, "
    + "an event name such as update.failed). Both carry a runId, one gup invocation; the "
    + "items are redacted by the CLI before upload and purged after the retention period.",
  "Everything is newest first and paginated. Dates are ISO 8601 UTC. The only write is "
    + "update_feedback (status and note): nothing here deletes or erases.",
].join("\n");

/** One server instance: the protocol state of one request, the tools over the ports. */
export function createFeedbackMcpServer(context: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  const { logger } = context;
  registerTool(server, searchFeedbackTool(context), logger);
  registerTool(server, getFeedbackTool(context), logger);
  registerTool(server, updateFeedbackTool(context), logger);
  registerTool(server, listInstallsTool(context), logger);
  registerTool(server, getInstallTool(context), logger);
  registerTool(server, listHistoryTool(context), logger);
  registerTool(server, listLogsTool(context), logger);
  registerTool(server, getRunTool(context), logger);
  return server;
}
