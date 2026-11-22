import type { FastifyReply, FastifyRequest } from "fastify";
import type { HttpFailure } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import { sendApiError, type ApiError } from "./api-error.js";

const INTERNAL_ERROR = HTTP_STATUS.internalError;

/**
 * Client errors Fastify or a plugin can raise before a handler runs, in the
 * contract's codes. A 400 there is always about the body as a whole:
 * malformed JSON, an empty body.
 */
const CLIENT_ERRORS: Readonly<Record<number, Omit<ApiError, "status">>> = {
  400: {
    error: "invalid",
    message: "The request body could not be parsed.",
    details: { fields: ["body"] },
  },
  404: { error: "not_found", message: "No such resource." },
  413: { error: "too_large", message: "The request body is too large." },
  415: { error: "unsupported_media_type", message: "Unsupported Content-Type." },
  429: { error: "rate_limited", message: "Too many requests, retry later." },
};

/**
 * Maps every error escaping a public route to the contract's error shape.
 * Anything unexpected becomes an opaque 500: internals are logged, never sent.
 */
export function apiErrorHandler(
  error: HttpFailure,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const status = error.statusCode ?? INTERNAL_ERROR;
  const known = CLIENT_ERRORS[status];
  if (known !== undefined) return sendApiError(reply, { status, ...known });
  request.log.error({ err: error }, "request failed");
  return sendApiError(reply, {
    status: INTERNAL_ERROR,
    error: "internal",
    message: "Internal error.",
  });
}
