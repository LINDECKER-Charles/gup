import type { FastifyReply } from "fastify";

export interface ApiError {
  readonly status: number;
  readonly error: string;
  readonly message: string;
  /** Extra members, e.g. the invalid `fields`. */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** The contract's single error shape: `{ "error": "<code>", "message": "<English text>" }`. */
export function sendApiError(reply: FastifyReply, apiError: ApiError): FastifyReply {
  const { status, error, message, details } = apiError;
  return reply.code(status).send({ error, message, ...details });
}
