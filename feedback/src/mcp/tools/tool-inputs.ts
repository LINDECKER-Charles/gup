import * as z from "zod";
import { FIELD_RULES } from "../../domain/field-rules.js";

/** Far beyond any real inbox or journal; it only bounds the offset a page asks for. */
const MAX_PAGE = 100_000;

/** The input fields several tools share, with their bounds and their description for the model. */
export const TOOL_INPUTS = {
  feedbackId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    .describe("Feedback number, as shown with a # (42 for #42)."),
  installId: z.uuidv4()
    .describe("Install ID: a UUID v4, as shown by `gup feedback` and pasted in bug reports."),
  runId: z.string().min(1).max(FIELD_RULES.runId.max)
    .describe("Run ID: one gup invocation; every history item and log line carries one."),
  page: z.number().int().min(1).max(MAX_PAGE).default(1).describe("1-based page number."),
  /** A page size capped at `max`, defaulting to `fallback`. */
  pageSize: (fallback: number, max: number) => z.number().int().min(1).max(max)
    .default(fallback).describe(`Items per page, at most ${max}.`),
} as const;
