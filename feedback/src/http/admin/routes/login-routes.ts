import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminSession } from "../../../ports/session-repository.js";
import { DURATION_MS } from "../../../time-units.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { codePage } from "../../../views/pages/code-page.js";
import { loginPage } from "../../../views/pages/login-page.js";
import { HTTP_STATUS } from "../../http-status.js";
import { RateLimitGate } from "../../rate-limit-gate.js";
import type { AdminContext } from "../admin-context.js";
import { isCsrfTokenValid, refuseFormSubmission } from "../admin-guard.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const { seeOther: SEE_OTHER } = HTTP_STATUS;
/** Per client address, for each of the two steps. */
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: 15 * DURATION_MS.minute } as const;
/**
 * Every address together, both steps counted: a guesser spread over many
 * addresses still gets 100 tries an hour at most. The cost is that such an
 * attack also locks the maintainer out for the hour; an existing session
 * keeps working.
 */
const ALL_LOGINS_LIMIT = { max: 100, timeWindow: DURATION_MS.hour } as const;
const ALL_LOGINS_KEY = "admin-login";
/** Bounds the work an attacker can request: scrypt cost does not depend on length, hashing does. */
const MAX_CREDENTIAL_LENGTH = 1024;
const MAX_CODE_LENGTH = 32;
/**
 * Wrong codes a password-checked session may type before the password is
 * asked again: with a one-step window either side, 3 codes in a million
 * match, so a guesser needs the password for every handful of tries.
 */
const MAX_FAILED_CODES = 5;
const PUBLIC_ROUTE = { isPublicAdminRoute: true } as const;
const MESSAGES = {
  badCredentials: "Identifiant ou mot de passe incorrect.",
  badCode: "Code incorrect ou expiré. Saisissez le code affiché en ce moment.",
  tooManyCodes: "Trop de codes incorrects : reconnectez-vous.",
} as const;

class LoginEndpoints {
  readonly #context: AdminContext;

  constructor(context: AdminContext) {
    this.#context = context;
  }

  register(app: FastifyInstance): void {
    const allLogins = new RateLimitGate(
      app.createRateLimit({ ...ALL_LOGINS_LIMIT, keyGenerator: () => ALL_LOGINS_KEY }));
    const limited = {
      config: { ...PUBLIC_ROUTE, rateLimit: LOGIN_RATE_LIMIT },
      onRequest: (request: FastifyRequest) => allLogins.enforce(request),
    };
    app.get("/login", { config: PUBLIC_ROUTE }, this.showForm);
    app.post("/login", limited, this.signIn);
    app.get("/login/code", { config: PUBLIC_ROUTE }, this.showCodeForm);
    app.post("/login/code", limited, this.checkCode);
    app.post("/logout", this.signOut);
  }

  readonly showForm = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await this.#session(request);
    if (session !== null && !session.secondFactorDue) {
      return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    }
    return sendHtml(reply, loginPage({ error: null, username: "" }));
  };

  readonly signIn = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = new RequestParams(request.body);
    const username = (params.text("username") ?? "").slice(0, MAX_CREDENTIAL_LENGTH);
    const password = (params.text("password") ?? "").slice(0, MAX_CREDENTIAL_LENGTH);
    const isValid = await this.#context.credentials.verify(username, password);
    if (!isValid) {
      const page = loginPage({ error: MESSAGES.badCredentials, username });
      return sendHtml(reply, page, HTTP_STATUS.unauthorized);
    }
    const secondFactorDue = this.#context.secondFactor !== null;
    await this.#openSession(request, reply, secondFactorDue);
    return reply.redirect(secondFactorDue ? ADMIN_UI.codePath : ADMIN_UI.home, SEE_OTHER);
  };

  readonly showCodeForm = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await this.#session(request);
    if (session === null || this.#context.secondFactor === null) {
      return reply.redirect(ADMIN_UI.loginPath, SEE_OTHER);
    }
    if (!session.secondFactorDue) return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    return sendHtml(reply, this.#codePage(session, null));
  };

  readonly checkCode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { secondFactor, sessions, cookie } = this.#context;
    const session = await this.#session(request);
    if (session === null || secondFactor === null) {
      return reply.redirect(ADMIN_UI.loginPath, SEE_OTHER);
    }
    if (!session.secondFactorDue) return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    if (!isCsrfTokenValid(request, session)) refuseFormSubmission();
    const code = (new RequestParams(request.body).text("code") ?? "").slice(0, MAX_CODE_LENGTH);
    if (await secondFactor.verify(code)) {
      await this.#openSession(request, reply, false);
      return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    }
    const failed = await sessions.recordFailedCode(session);
    if (failed >= MAX_FAILED_CODES) {
      await sessions.close(cookie.read(request));
      cookie.clear(reply);
      const page = loginPage({ error: MESSAGES.tooManyCodes, username: "" });
      return sendHtml(reply, page, HTTP_STATUS.unauthorized);
    }
    return sendHtml(reply, this.#codePage(session, MESSAGES.badCode), HTTP_STATUS.unauthorized);
  };

  readonly signOut = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.#context.sessions.close(this.#context.cookie.read(request));
    this.#context.cookie.clear(reply);
    return reply.redirect(ADMIN_UI.loginPath, SEE_OTHER);
  };

  #session(request: FastifyRequest): Promise<AdminSession | null> {
    return this.#context.sessions.resolve(this.#context.cookie.read(request));
  }

  /** A fresh session at each step: a token planted or seen before cannot be promoted. */
  async #openSession(
    request: FastifyRequest, reply: FastifyReply, secondFactorDue: boolean,
  ): Promise<void> {
    const { sessions, cookie } = this.#context;
    await sessions.close(cookie.read(request));
    const { token } = await sessions.open({ secondFactorDue });
    cookie.set(reply, token);
  }

  #codePage(session: AdminSession, error: string | null): string {
    const digits = this.#context.secondFactor?.digits ?? 0;
    return codePage({ csrfToken: session.csrfToken, digits, error });
  }
}

export function registerLoginRoutes(app: FastifyInstance, context: AdminContext): void {
  new LoginEndpoints(context).register(app);
}
