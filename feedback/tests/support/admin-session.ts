import type { FastifyInstance } from "fastify";
import { ADMIN_PASSWORD, ADMIN_USERNAME, PUBLIC_ORIGIN } from "./test-app.js";

const COOKIE = "__Host-gup_admin";
const FORM = "application/x-www-form-urlencoded";

/** A signed-in maintainer: GETs and same-origin form posts carrying the session. */
export class AdminSession {
  readonly #app: FastifyInstance;
  readonly #token: string;
  readonly csrf: string;

  private constructor(app: FastifyInstance, token: string, csrf: string) {
    this.#app = app;
    this.#token = token;
    this.csrf = csrf;
  }

  static async open(app: FastifyInstance): Promise<AdminSession> {
    const login = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: new URLSearchParams({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
        .toString(),
      headers: { origin: PUBLIC_ORIGIN, "content-type": FORM },
    });
    const token = login.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? "";
    const home = await app.inject({ method: "GET", url: "/admin", cookies: { [COOKIE]: token } });
    const csrf = /name="_csrf" value="([^"]+)"/.exec(home.body)?.[1] ?? "";
    return new AdminSession(app, token, csrf);
  }

  get(url: string) {
    return this.#app.inject({ method: "GET", url, cookies: { [COOKIE]: this.#token } });
  }

  /** Posts the form with this session's CSRF token unless `fields` sets its own. */
  post(url: string, fields: Record<string, string> = {}) {
    return this.#app.inject({
      method: "POST",
      url,
      cookies: { [COOKIE]: this.#token },
      payload: new URLSearchParams({ _csrf: this.csrf, ...fields }).toString(),
      headers: { origin: PUBLIC_ORIGIN, "content-type": FORM },
    });
  }
}
