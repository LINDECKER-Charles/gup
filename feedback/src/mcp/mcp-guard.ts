import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendApiError } from "../http/api/api-error.js";
import { HTTP_STATUS } from "../http/http-status.js";
import { RateLimitGate } from "../http/rate-limit-gate.js";
import { DURATION_MS } from "../time-units.js";
import { BearerTokenVerifier } from "./bearer-token-verifier.js";

const LIMITS = {
  /** Per client address: guessing a 256-bit token is hopeless, this keeps the logs quiet. */
  failedAuth: { max: 20, timeWindow: 15 * DURATION_MS.minute },
  /** Per client address, every call: a runaway agent loop, not a person. */
  calls: { max: 600, timeWindow: DURATION_MS.hour },
} as const;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

/** Same answer for a missing, malformed or wrong token. */
const UNAUTHORIZED = {
  status: HTTP_STATUS.unauthorized,
  error: "unauthorized",
  message: "Missing or invalid bearer token.",
} as const;

const FOREIGN_ORIGIN = {
  status: HTTP_STATUS.forbidden,
  error: "forbidden",
  message: "Browser requests are refused.",
} as const;

/**
 * onRequest hook of the MCP routes, before any body is read: no browser
 * (an `Origin` header means a page is calling — DNS rebinding, CSRF; MCP
 * clients send none), a cap on calls, then the bearer token, whose failures
 * are limited on their own.
 */
export class McpGuard {
  readonly #verifier: BearerTokenVerifier;
  readonly #calls: RateLimitGate;
  readonly #failedAuth: RateLimitGate;

  constructor(app: FastifyInstance, tokenDigest: Buffer) {
    this.#verifier = new BearerTokenVerifier(tokenDigest);
    this.#calls = new RateLimitGate(app.createRateLimit(LIMITS.calls));
    this.#failedAuth = new RateLimitGate(app.createRateLimit(LIMITS.failedAuth));
  }

  readonly check = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.headers(SECURITY_HEADERS);
    if (request.headers.origin !== undefined) return sendApiError(reply, FOREIGN_ORIGIN);
    await this.#calls.enforce(request);
    // Exhausted: `enforce` throws the 429, even for the right token.
    if (await this.#failedAuth.isExhausted(request)) await this.#failedAuth.enforce(request);
    if (this.#verifier.isAuthorized(request.headers.authorization)) return undefined;
    await this.#failedAuth.count(request);
    reply.header("WWW-Authenticate", "Bearer");
    return sendApiError(reply, UNAUTHORIZED);
  };
}
