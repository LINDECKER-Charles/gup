import type { FastifyBaseLogger } from "fastify";
import type * as z from "zod";
import type { McpPermission } from "../../domain/mcp-access.js";
import type { FeedbackRepository } from "../../ports/feedback-repository.js";
import type { InstallReader } from "../../ports/install-reader.js";

/** What every tool reads and writes through: ports only, as the HTTP app. */
export interface ToolContext {
  readonly feedback: FeedbackRepository;
  readonly journals: InstallReader;
  /** For failures the caller only sees as an opaque error. */
  readonly logger: FastifyBaseLogger;
  /**
   * What the request's access may do. Tools are registered by permission;
   * a tool that would show another permission's data leaves it out.
   */
  readonly permissions: ReadonlySet<McpPermission>;
}

/** A tool's answer: the structured result, and the same in a few lines a model reads cheaply. */
export interface ToolOutput {
  readonly structured: Record<string, unknown>;
  readonly text: string;
}

export interface ToolSpec<Input extends z.ZodObject> {
  /** snake_case, the name the model calls. */
  readonly name: string;
  readonly title: string;
  /** Written for the model: what the tool returns and when to use it. */
  readonly description: string;
  /** Strict: unknown keys are refused. */
  readonly input: Input;
  /** false only for the triage write. */
  readonly isReadOnly: boolean;
  readonly run: (input: z.output<Input>) => Promise<ToolOutput>;
}
