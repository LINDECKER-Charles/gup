import type { FastifyInstance, FastifyReply } from "fastify";
import { STYLESHEET } from "../../views/kit/stylesheet.js";
import type { AdminContext } from "./admin-context.js";
import { HttpError } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import { adminErrorHandler } from "./admin-error-handler.js";
import { createAdminGuard } from "./admin-guard.js";
import { registerFeedbackRoutes } from "./routes/feedback-routes.js";
import { registerInboxRoutes } from "./routes/inbox-routes.js";
import { registerInstallsRoutes } from "./routes/installs-routes.js";
import { registerLoginRoutes } from "./routes/login-routes.js";

/** No script, no inline style, no framing, forms posting back here only. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

/** Added to the service-wide ones (`X-Content-Type-Options`, HSTS). */
const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  // Not `no-referrer`: with it browsers send `Origin: null` on the back
  // office's own form posts, which the same-origin guard refuses.
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
} as const;

/** The stylesheet URL carries its content hash: it may be cached for good. */
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

function sendStylesheet(_request: unknown, reply: FastifyReply): FastifyReply {
  return reply
    .header("Cache-Control", ASSET_CACHE_CONTROL)
    .type("text/css; charset=utf-8")
    .send(STYLESHEET.css);
}

/** The back office, mounted under `/admin`: hooks, error pages and every route. */
export function adminPlugin(context: AdminContext) {
  return async (app: FastifyInstance): Promise<void> => {
    app.decorateRequest("adminSession", null);
    app.addHook("onRequest", async (_request, reply) => {
      reply.headers(SECURITY_HEADERS);
    });
    app.addHook("preHandler", createAdminGuard(context));
    app.setErrorHandler(adminErrorHandler);
    app.setNotFoundHandler((request, reply) =>
      adminErrorHandler(new HttpError(HTTP_STATUS.notFound, "Not found."), request, reply));
    app.get("/assets/app.css", { config: { isPublicAdminRoute: true } }, sendStylesheet);
    registerLoginRoutes(app, context);
    registerInboxRoutes(app, context);
    registerFeedbackRoutes(app, context);
    registerInstallsRoutes(app, context);
  };
}
