import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminSession } from "../../ports/session-repository.js";
import { constantTimeEqual } from "../../security/constant-time-equal.js";
import { isSameOriginRequest } from "../../security/same-origin.js";
import { ADMIN_UI } from "../../views/admin-ui.js";
import { HttpError } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import type { AdminContext } from "./admin-context.js";
import { RequestParams } from "./request-params.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in admin's session; null on public back-office routes. */
    adminSession: AdminSession | null;
  }
  interface FastifyContextConfig {
    /** Reachable without a session: the login page and the assets it needs. */
    isPublicAdminRoute?: boolean;
  }
}

export function isCsrfTokenValid(request: FastifyRequest, session: AdminSession): boolean {
  const token = new RequestParams(request.body).text(ADMIN_UI.csrfField);
  return token !== null && constantTimeEqual(token, session.csrfToken);
}

export function refuseFormSubmission(): never {
  throw new HttpError(HTTP_STATUS.forbidden, "Cross-site or expired form submission refused.");
}

/**
 * preHandler of every back-office route: a POST must come from the service's
 * own origin (login included), and a non-public route needs a live, fully
 * signed-in session (second factor given) — plus, for a POST, that session's
 * CSRF token.
 */
export function createAdminGuard(context: AdminContext) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const isPost = request.method === "POST";
    const { publicOrigin } = context.config;
    if (isPost && !isSameOriginRequest(request.headers, publicOrigin)) refuseFormSubmission();
    if (request.routeOptions.config.isPublicAdminRoute === true) return;
    const session = await context.sessions.resolve(context.cookie.read(request));
    if (session === null || session.secondFactorDue) {
      await reply.redirect(ADMIN_UI.loginPath, HTTP_STATUS.seeOther);
      return;
    }
    if (isPost && !isCsrfTokenValid(request, session)) refuseFormSubmission();
    await context.sessions.keepAlive(session);
    request.adminSession = session;
  };
}
