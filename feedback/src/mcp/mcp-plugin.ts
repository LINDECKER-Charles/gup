import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../app-deps.js";
import { sendApiError } from "../http/api/api-error.js";
import { HTTP_STATUS } from "../http/http-status.js";
import { createFeedbackMcpServer } from "./feedback-mcp-server.js";
import { McpEndpoint } from "./mcp-endpoint.js";
import { McpGuard } from "./mcp-guard.js";
import { toWebRequest } from "./web-request.js";

const MCP_PATH = "/mcp";
const BODY_LIMIT_BYTES = 1024 * 1024;
const JSON_CONTENT_TYPE = "application/json";

/** Stateless: no SSE stream to open (GET), no session to end (DELETE). */
function methodNotAllowed(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendApiError(reply.header("Allow", "POST"), {
    status: HTTP_STATUS.methodNotAllowed,
    error: "method_not_allowed",
    message: "This MCP endpoint is stateless: POST only.",
  });
}

/**
 * `POST /mcp`: the MCP server Claude Code reaches to read feedback and shared
 * journals, behind a bearer token. Mounted in its own scope: JSON bodies
 * only, and the guard runs on these routes alone.
 */
export function mcpPlugin(deps: AppDeps, tokenDigest: Buffer) {
  return async (app: FastifyInstance): Promise<void> => {
    const context = { feedback: deps.feedback, journals: deps.journals, logger: app.log };
    const endpoint = new McpEndpoint({
      createServer: () => createFeedbackMcpServer(context),
      onError: (error) => app.log.warn({ err: error }, "MCP request rejected"),
    });
    app.addHook("onClose", () => endpoint.close());
    app.removeAllContentTypeParsers();
    app.addContentTypeParser(JSON_CONTENT_TYPE, { parseAs: "string" },
      app.getDefaultJsonParser("error", "error"));
    app.addHook("onRequest", new McpGuard(app, tokenDigest).check);
    app.post(MCP_PATH, { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
      const response = await endpoint.handle(
        toWebRequest(request, deps.config.publicOrigin), request.body);
      // The SDK's JSON-RPC response (application/json, nosniff), never HTML: semgrep's
      // Express rule direct-response-write does not apply to it.
      return reply.send(response); // nosemgrep
    });
    app.get(MCP_PATH, methodNotAllowed);
    app.delete(MCP_PATH, methodNotAllowed);
  };
}
