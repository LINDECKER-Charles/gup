import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminSecondFactor } from "../../../auth/admin-second-factor.js";
import { opensBackOffice } from "../../../auth/admin-sessions.js";
import type { AdminSession, SecondFactorStage } from "../../../ports/session-repository.js";
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
 * Codes a password-checked session may try, reserved before each check so
 * parallel posts cannot try more: with a one-step window either side, 3 codes
 * in a million match, so a guesser needs the password for every handful.
 */
const MAX_CODE_ATTEMPTS = 5;
const PUBLIC_ROUTE = { isPublicAdminRoute: true } as const;
const MESSAGES = {
  badCredentials: "Identifiant ou mot de passe incorrect.",
  badCode: "Code incorrect ou expiré. Saisissez le code affiché en ce moment.",
  tooManyCodes: "Trop de codes incorrects : reconnectez-vous.",
} as const;

interface AwaitingCode {
  readonly session: AdminSession;
  readonly secondFactor: AdminSecondFactor;
}

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
    // Public so a session still awaiting its code can be dropped too; CSRF is checked below.
    app.post("/logout", { config: PUBLIC_ROUTE }, this.signOut);
  }

  readonly showForm = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await this.#session(request);
    if (session !== null && this.#opensBackOffice(session)) {
      return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    }
    return sendHtml(reply, loginPage({ error: null, username: "" }));
  };

  readonly signIn = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = new RequestParams(request.body);
    const username = (params.text("username") ?? "").slice(0, MAX_CREDENTIAL_LENGTH);
    const password = (params.text("password") ?? "").slice(0, MAX_CREDENTIAL_LENGTH);
    if (!await this.#context.credentials.verify(username, password)) {
      request.log.warn("admin sign-in: wrong user name or password");
      const page = loginPage({ error: MESSAGES.badCredentials, username });
      return sendHtml(reply, page, HTTP_STATUS.unauthorized);
    }
    if (this.#context.secondFactor === null) {
      await this.#openSession(request, reply, "skipped");
      return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    }
    request.log.info("admin sign-in: password accepted, code due");
    await this.#openSession(request, reply, "due");
    return reply.redirect(ADMIN_UI.codePath, SEE_OTHER);
  };

  readonly showCodeForm = async (request: FastifyRequest, reply: FastifyReply) => {
    const awaiting = await this.#awaitingCode(request);
    if (typeof awaiting === "string") return reply.redirect(awaiting, SEE_OTHER);
    return sendHtml(reply, this.#codePage(awaiting, null));
  };

  readonly checkCode = async (request: FastifyRequest, reply: FastifyReply) => {
    const awaiting = await this.#awaitingCode(request);
    if (typeof awaiting === "string") return reply.redirect(awaiting, SEE_OTHER);
    if (!isCsrfTokenValid(request, awaiting.session)) refuseFormSubmission();
    const attempt = await this.#context.sessions.reserveCodeAttempt(
      awaiting.session, MAX_CODE_ATTEMPTS);
    if (attempt === null) return this.#startOver(request, reply);
    const code = (new RequestParams(request.body).text("code") ?? "").slice(0, MAX_CODE_LENGTH);
    if (await awaiting.secondFactor.verify(code)) {
      await this.#openSession(request, reply, "passed");
      return reply.redirect(ADMIN_UI.home, SEE_OTHER);
    }
    request.log.warn({ attempt, of: MAX_CODE_ATTEMPTS }, "admin sign-in: wrong TOTP code");
    if (attempt >= MAX_CODE_ATTEMPTS) return this.#startOver(request, reply);
    return sendHtml(reply, this.#codePage(awaiting, MESSAGES.badCode), HTTP_STATUS.unauthorized);
  };

  readonly signOut = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await this.#session(request);
    if (session !== null && !isCsrfTokenValid(request, session)) refuseFormSubmission();
    await this.#context.sessions.close(this.#context.cookie.read(request));
    this.#context.cookie.clear(reply);
    return reply.redirect(ADMIN_UI.loginPath, SEE_OTHER);
  };

  #session(request: FastifyRequest): Promise<AdminSession | null> {
    return this.#context.sessions.resolve(this.#context.cookie.read(request));
  }

  #opensBackOffice(session: AdminSession): boolean {
    return opensBackOffice(session, this.#context.secondFactor !== null);
  }

  /** The session awaiting its code, or where to send a request that has none. */
  async #awaitingCode(request: FastifyRequest): Promise<AwaitingCode | string> {
    const { secondFactor } = this.#context;
    const session = await this.#session(request);
    if (session === null || secondFactor === null) return ADMIN_UI.loginPath;
    if (session.secondFactor === "due") return { session, secondFactor };
    return this.#opensBackOffice(session) ? ADMIN_UI.home : ADMIN_UI.loginPath;
  }

  /** No code attempt left: the half-open session goes, the password is asked again. */
  async #startOver(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { sessions, cookie } = this.#context;
    request.log.warn("admin sign-in: code attempts used up, password asked again");
    await sessions.close(cookie.read(request));
    cookie.clear(reply);
    const page = loginPage({ error: MESSAGES.tooManyCodes, username: "" });
    return sendHtml(reply, page, HTTP_STATUS.unauthorized);
  }

  /** A fresh session at each step: a token planted or seen before cannot be promoted. */
  async #openSession(
    request: FastifyRequest, reply: FastifyReply, secondFactor: SecondFactorStage,
  ): Promise<void> {
    const { sessions, cookie } = this.#context;
    await sessions.close(cookie.read(request));
    const { token } = await sessions.open(secondFactor);
    cookie.set(reply, token);
  }

  #codePage(awaiting: AwaitingCode, error: string | null): string {
    const { session, secondFactor } = awaiting;
    return codePage({ csrfToken: session.csrfToken, digits: secondFactor.digits, error });
  }
}

export function registerLoginRoutes(app: FastifyInstance, context: AdminContext): void {
  new LoginEndpoints(context).register(app);
}
