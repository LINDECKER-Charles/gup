import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ADMIN_ASSETS } from "../../views/admin-assets.js";
import type { AdminContext } from "./admin-context.js";
import { HttpError } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import { adminErrorHandler } from "./admin-error-handler.js";
import { createAdminGuard } from "./admin-guard.js";
import { registerFeedbackRoutes } from "./routes/feedback-routes.js";
import { registerInboxRoutes } from "./routes/inbox-routes.js";
import { registerInstallsRoutes } from "./routes/installs-routes.js";
import { RequestParams } from "./request-params.js";
import { registerLoginRoutes } from "./routes/login-routes.js";
import { registerMailsRoutes } from "./routes/mails-routes.js";

/** No script, no inline style, no framing, forms posting back here only. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "font-src 'self'",
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

/** An asset's URL carries its content hash: it may be cached for good. */
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Only the names the asset table lists: the request never reaches the file system. */
function sendAsset(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const asset = ADMIN_ASSETS.get(new RequestParams(request.params).text("name") ?? "");
  if (asset === undefined) throw new HttpError(HTTP_STATUS.notFound, "Not found.");
  return reply
    .header("Cache-Control", ASSET_CACHE_CONTROL)
    .type(asset.contentType)
    .send(asset.body);
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
    app.get("/assets/:name", { config: { isPublicAdminRoute: true } }, sendAsset);
    registerLoginRoutes(app, context);
    registerInboxRoutes(app, context);
    registerFeedbackRoutes(app, context);
    registerInstallsRoutes(app, context);
    registerMailsRoutes(app, context);
  };
}
