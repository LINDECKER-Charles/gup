import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DURATION_MS } from "../../../time-units.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { loginPage } from "../../../views/pages/login-page.js";
import { HTTP_STATUS } from "../../http-status.js";
import { RateLimitGate } from "../../rate-limit-gate.js";
import type { AdminContext } from "../admin-context.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const { seeOther: SEE_OTHER } = HTTP_STATUS;
/** Per client address. */
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: 15 * DURATION_MS.minute } as const;
/**
 * Every address together: a guesser spread over many addresses still gets
 * 100 tries an hour at most. The cost is that such an attack also locks the
 * maintainer out for the hour; an existing session keeps working.
 */
const ALL_LOGINS_LIMIT = { max: 100, timeWindow: DURATION_MS.hour } as const;
const ALL_LOGINS_KEY = "admin-login";
/** Bounds the work an attacker can request: scrypt cost does not depend on length, hashing does. */
const MAX_CREDENTIAL_LENGTH = 1024;
const PUBLIC_ROUTE = { isPublicAdminRoute: true } as const;

class LoginEndpoints {
  readonly #context: AdminContext;

  constructor(context: AdminContext) {
    this.#context = context;
  }

  register(app: FastifyInstance): void {
    const allLogins = new RateLimitGate(
      app.createRateLimit({ ...ALL_LOGINS_LIMIT, keyGenerator: () => ALL_LOGINS_KEY }));
    app.get("/login", { config: PUBLIC_ROUTE }, this.showForm);
    app.post("/login", {
      config: { ...PUBLIC_ROUTE, rateLimit: LOGIN_RATE_LIMIT },
      onRequest: (request) => allLogins.enforce(request),
    }, this.signIn);
    app.post("/logout", this.signOut);
  }

  readonly showForm = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await this.#context.sessions.resolve(this.#context.cookie.read(request));
    if (session !== null) return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    return sendHtml(reply, loginPage({ error: null, username: "" }));
  };

  readonly signIn = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = new RequestParams(request.body);
    const username = (params.text("username") ?? "").slice(0, MAX_CREDENTIAL_LENGTH);
    const password = (params.text("password") ?? "").slice(0, MAX_CREDENTIAL_LENGTH);
    const isValid = await this.#context.credentials.verify(username, password);
    if (!isValid) {
      const error = "Identifiant ou mot de passe incorrect.";
      return sendHtml(reply, loginPage({ error, username }), HTTP_STATUS.unauthorized);
    }
    // A fresh session at every login: a token planted before cannot be promoted.
    await this.#context.sessions.close(this.#context.cookie.read(request));
    const { token } = await this.#context.sessions.open();
    this.#context.cookie.set(reply, token);
    return reply.redirect(ADMIN_UI.home, SEE_OTHER);
  };

  readonly signOut = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.#context.sessions.close(this.#context.cookie.read(request));
    this.#context.cookie.clear(reply);
    return reply.redirect(ADMIN_UI.loginPath, SEE_OTHER);
  };
}

export function registerLoginRoutes(app: FastifyInstance, context: AdminContext): void {
  new LoginEndpoints(context).register(app);
}
