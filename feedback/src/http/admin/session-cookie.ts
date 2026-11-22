import type { FastifyReply, FastifyRequest } from "fastify";
import { AdminSessions } from "../../auth/admin-sessions.js";
import { DURATION_MS } from "../../time-units.js";

/** `__Host-` pins the cookie to this exact origin, over HTTPS, on path `/`. */
const SECURE_NAME = "__Host-gup_admin";
/** Local http development only: browsers refuse a `__Host-` cookie without `Secure`. */
const INSECURE_NAME = "gup_admin";

export class SessionCookie {
  readonly #isSecure: boolean;
  readonly #name: string;

  constructor(isSecure: boolean) {
    this.#isSecure = isSecure;
    this.#name = isSecure ? SECURE_NAME : INSECURE_NAME;
  }

  read(request: FastifyRequest): string | undefined {
    return request.cookies[this.#name];
  }

  set(reply: FastifyReply, token: string): void {
    reply.setCookie(this.#name, token, {
      ...this.#attributes(),
      maxAge: AdminSessions.absoluteLifetimeMs / DURATION_MS.second,
    });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(this.#name, this.#attributes());
  }

  #attributes() {
    return { httpOnly: true, secure: this.#isSecure, sameSite: "strict", path: "/" } as const;
  }
}
