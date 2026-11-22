import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppDeps } from "./app-deps.js";
import { AdminCredentials } from "./auth/admin-credentials.js";
import { AdminSecondFactor } from "./auth/admin-second-factor.js";
import { AdminSessions } from "./auth/admin-sessions.js";
import { Totp } from "./auth/totp.js";
import type { AdminContext } from "./http/admin/admin-context.js";
import { adminPlugin } from "./http/admin/admin-plugin.js";
import { SessionCookie } from "./http/admin/session-cookie.js";
import { apiErrorHandler } from "./http/api/api-error-handler.js";
import { registerFeedbackRoute } from "./http/api/feedback-route.js";
import { registerHealthRoute } from "./http/api/health-route.js";
import { installRoutes } from "./http/api/install-routes.js";
import { HttpError } from "./http/http-error.js";
import { HTTP_STATUS } from "./http/http-status.js";
import { securityHeaders } from "./http/security-headers.js";
import { NotifyRecipient } from "./mail/notify-recipient.js";
import { mcpPlugin } from "./mcp/mcp-plugin.js";
import { ADMIN_UI } from "./views/admin-ui.js";

/** Default for every route that does not set its own (the logs upload does). */
const DEFAULT_BODY_LIMIT_BYTES = 32 * 1024;

async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(fastifyFormbody);
  await app.register(fastifyCookie);
  // Opt-in per route (`config.rateLimit`): only the routes the contract limits are limited.
  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new HttpError(HTTP_STATUS.tooManyRequests, `Rate limit exceeded, retry in ${context.after}.`),
  });
}

function secondFactorOf(deps: AppDeps): AdminSecondFactor | null {
  const { totpSecret } = deps.config.admin;
  if (totpSecret === null) return null;
  return new AdminSecondFactor({
    totp: new Totp(totpSecret), store: deps.secondFactors, clock: deps.clock,
  });
}

function recipientOf(deps: AppDeps): NotifyRecipient | null {
  const { mail } = deps.config;
  return mail === null ? null : new NotifyRecipient(deps.mailSettings, mail.notifyTo);
}

function adminContext(deps: AppDeps): AdminContext {
  return {
    config: deps.config,
    feedback: deps.feedback,
    installs: deps.installs,
    journals: deps.journals,
    outbox: deps.outbox,
    mailer: deps.mailer,
    recipient: recipientOf(deps),
    clock: deps.clock,
    sessions: new AdminSessions({ repository: deps.sessions, clock: deps.clock }),
    credentials: new AdminCredentials(deps.config.admin),
    secondFactor: secondFactorOf(deps),
    cookie: new SessionCookie(deps.config.cookieSecure),
  };
}

/** The HTTP application, from its ports: no I/O of its own, so tests drive it with `inject`. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger,
    trustProxy: typeof deps.config.trustProxy === "boolean"
      ? deps.config.trustProxy
      : [...deps.config.trustProxy],
    bodyLimit: DEFAULT_BODY_LIMIT_BYTES,
  });
  await registerPlugins(app);
  app.addHook("onRequest", securityHeaders(deps.config.publicOrigin));
  app.setErrorHandler(apiErrorHandler);
  app.setNotFoundHandler((request, reply) =>
    apiErrorHandler(new HttpError(HTTP_STATUS.notFound, "Not found."), request, reply));
  app.get("/", (_request, reply) => reply.redirect(deps.config.landingUrl, HTTP_STATUS.found));
  registerHealthRoute(app, deps.health);
  registerFeedbackRoute(app, deps);
  await app.register(installRoutes(deps));
  await app.register(adminPlugin(adminContext(deps)), { prefix: ADMIN_UI.home });
  // Without a configured token digest the endpoint does not exist: /mcp answers 404.
  const { mcpTokenDigest } = deps.config;
  if (mcpTokenDigest !== undefined) await app.register(mcpPlugin(deps, mcpTokenDigest));
  return app;
}
