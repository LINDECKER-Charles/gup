import type { FastifyRequest } from "fastify";

/** The CSRF token every form of a signed-in page embeds. */
export function csrfTokenOf(request: FastifyRequest): string {
  return request.adminSession?.csrfToken ?? "";
}
