import type { FastifyReply, FastifyRequest } from "fastify";

/** One year: the service never goes back to plain http once it served https. */
const STRICT_TRANSPORT_SECURITY = "max-age=31536000";

/**
 * onRequest hook of every route, set before anything can fail so error
 * replies carry the headers too: no MIME sniffing anywhere, and HSTS when the
 * service is published over https.
 */
export function securityHeaders(publicOrigin: string) {
  const isHttps = new URL(publicOrigin).protocol === "https:";
  const headers: Record<string, string> = { "X-Content-Type-Options": "nosniff" };
  if (isHttps) headers["Strict-Transport-Security"] = STRICT_TRANSPORT_SECURITY;
  return async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.headers(headers);
  };
}
