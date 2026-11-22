import type { FastifyRequest } from "fastify";

const REDACTED = "[redacted]";

/**
 * pino settings: JSON lines on stdout, for the host's log collector. Requests
 * are logged by method and URL only — no client address (the contract never
 * stores it; the edge keeps its own access log) and never a body. The header
 * redaction guards any log call that passes headers explicitly.
 */
export function loggerOptions(level: string) {
  return {
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "headers.authorization",
        "headers.cookie",
      ],
      censor: REDACTED,
    },
    serializers: {
      req: (request: FastifyRequest) => ({ method: request.method, url: request.url }),
    },
  };
}
