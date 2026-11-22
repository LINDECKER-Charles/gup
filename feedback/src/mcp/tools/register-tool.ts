import type {
  CallToolResult, McpServer, StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import type { FastifyBaseLogger } from "fastify";
import type * as z from "zod";
import { ToolFailure } from "./tool-failure.js";
import type { ToolOutput, ToolSpec } from "./tool-spec.js";

const INTERNAL_FAILURE = "Internal error; the service logged it.";

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Tool errors are results the model reads, never protocol errors or HTTP 500s. */
async function settle(
  run: () => Promise<ToolOutput>,
  logger: FastifyBaseLogger,
): Promise<CallToolResult> {
  try {
    const output = await run();
    return { content: [{ type: "text", text: output.text }], structuredContent: output.structured };
  } catch (error) {
    if (error instanceof ToolFailure) return failure(error.message);
    logger.error({ err: error }, "MCP tool failed");
    return failure(INTERNAL_FAILURE);
  }
}

/**
 * Registers a tool. The SDK validates the arguments against `spec.input`
 * before the callback runs (a mismatch is answered as a tool error), so the
 * callback's input already has the schema's output type.
 */
export function registerTool<Input extends z.ZodObject>(
  server: McpServer,
  spec: ToolSpec<Input>,
  logger: FastifyBaseLogger,
): void {
  const inputSchema: StandardSchemaWithJSON = spec.input;
  server.registerTool(spec.name, {
    title: spec.title,
    description: spec.description,
    inputSchema,
    annotations: {
      readOnlyHint: spec.isReadOnly,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (input) => settle(() => spec.run(input as z.output<Input>), logger));
}
