import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "./http-error.js";
import { HTTP_STATUS } from "./http-status.js";

export type RateLimiter = ReturnType<FastifyInstance["createRateLimit"]>;

function tooManyRequests(retryInSeconds: number): HttpError {
  return new HttpError(
    HTTP_STATUS.tooManyRequests, `Rate limit exceeded, retry in ${retryInSeconds} s.`);
}

/**
 * A limit applied from inside a hook or a handler, for what a route's single
 * `config.rateLimit` cannot express: several limits on one route, a limit
 * keyed on an identity checked first, or one counted only on success.
 * Its 429 goes through the scope's error handler like any other error.
 */
export class RateLimitGate {
  readonly #limiter: RateLimiter;

  constructor(limiter: RateLimiter) {
    this.#limiter = limiter;
  }

  /** Counts the request; throws a 429 once the limit is crossed. */
  async enforce(request: FastifyRequest): Promise<void> {
    const result = await this.#limiter(request);
    if (result.isAllowed || !result.isExceeded) return;
    throw tooManyRequests(result.ttlInSeconds);
  }

  /** Whether the next counted request would cross the limit; counts nothing. */
  async isExhausted(request: FastifyRequest): Promise<boolean> {
    const result = await this.#limiter(request, { increment: false });
    return !result.isAllowed && result.isExceeded;
  }

  /** Counts a request that already went through, without refusing it. */
  async count(request: FastifyRequest): Promise<void> {
    await this.#limiter(request);
  }
}
