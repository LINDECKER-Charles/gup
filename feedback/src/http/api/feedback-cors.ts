import type { FastifyReply, FastifyRequest } from "fastify";
import { HTTP_STATUS } from "../http-status.js";

const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * CORS for `POST /api/feedback`: the allowed origins only, `POST` with a
 * `Content-Type`, no credentials. A disallowed origin simply gets no CORS
 * headers, and the browser keeps the response from its script.
 */
export class FeedbackCors {
  readonly #allowedOrigins: ReadonlySet<string>;

  constructor(allowedOrigins: readonly string[]) {
    this.#allowedOrigins = new Set(allowedOrigins);
  }

  /** onRequest hook of the POST route: set early, so error replies carry them too. */
  readonly decorate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.header("Vary", "Origin");
    const origin = this.#allowedOrigin(request);
    if (origin !== null) reply.header("Access-Control-Allow-Origin", origin);
  };

  readonly preflight = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Vary", "Origin");
    const origin = this.#allowedOrigin(request);
    if (origin !== null) {
      reply.headers({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": String(PREFLIGHT_MAX_AGE_SECONDS),
      });
    }
    return reply.code(HTTP_STATUS.noContent).send();
  };

  #allowedOrigin(request: FastifyRequest): string | null {
    const origin = request.headers.origin;
    return origin !== undefined && this.#allowedOrigins.has(origin) ? origin : null;
  }
}
