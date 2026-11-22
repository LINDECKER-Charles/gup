import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD, ADMIN_USERNAME, createTestApp, PUBLIC_ORIGIN, type TestApp,
} from "../../support/test-app.js";

const COOKIE = "__Host-gup_admin";
const FORM = "application/x-www-form-urlencoded";
const SAME_ORIGIN = { origin: PUBLIC_ORIGIN, "content-type": FORM };
const HOUR_MS = 3_600_000;

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
  await ctx.feedback.create({
    kind: "bug", title: "Broken", message: "Something is broken.", email: null,
    installId: null, gupVersion: null, platform: null, locale: null,
  });
});

afterEach(async () => {
  await ctx.app.close();
});

function login(password = ADMIN_PASSWORD, headers: Record<string, string> = SAME_ORIGIN) {
  return ctx.app.inject({
    method: "POST",
    url: "/admin/login",
    payload: new URLSearchParams({ username: ADMIN_USERNAME, password }).toString(),
    headers,
  });
}

async function signIn(): Promise<string> {
  const response = await login();
  const cookie = response.cookies.find((candidate) => candidate.name === COOKIE);
  if (cookie === undefined) throw new Error("no session cookie");
  return cookie.value;
}

function get(url: string, token?: string) {
  return ctx.app.inject({ method: "GET", url, cookies: token === undefined ? {} : { [COOKIE]: token } });
}

interface FormPost {
  readonly token: string;
  readonly fields: Record<string, string>;
  readonly origin?: string;
}

function post(url: string, { token, fields, origin = PUBLIC_ORIGIN }: FormPost) {
  return ctx.app.inject({
    method: "POST",
    url,
    cookies: { [COOKIE]: token },
    payload: new URLSearchParams(fields).toString(),
    headers: { origin, "content-type": FORM },
  });
}

async function csrfTokenOf(token: string): Promise<string> {
  const page = await get("/admin", token);
  const match = /name="_csrf" value="([^"]+)"/.exec(page.body);
  if (match?.[1] === undefined) throw new Error("no CSRF token on the page");
  return match[1];
}

describe("admin login", () => {
  it("opens a session with a host-only, HttpOnly, Strict cookie", async () => {
    const response = await login();
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe("/admin");
    expect(response.cookies.find((cookie) => cookie.name === COOKIE)).toMatchObject({
      httpOnly: true, secure: true, sameSite: "Strict", path: "/",
    });
    expect(ctx.sessions.sessions.size).toBe(1);
  });

  it("refuses a wrong password without opening a session", async () => {
    const response = await login("wrong password");
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain("Identifiant ou mot de passe incorrect.");
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it("refuses a login posted from another origin", async () => {
    const response = await login(ADMIN_PASSWORD, { origin: "https://evil.example", "content-type": FORM });
    expect(response.statusCode).toBe(403);
    expect(ctx.sessions.sessions.size).toBe(0);
  });
});

describe("admin session", () => {
  it("sends a visitor without a session to the login page", async () => {
    const response = await get("/admin");
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe("/admin/login");
  });

  it("serves the inbox to a signed-in admin, with a strict CSP", async () => {
    const response = await get("/admin", await signIn());
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Broken");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("ends a session idle for more than twelve hours", async () => {
    const token = await signIn();
    ctx.clock.advance(13 * HOUR_MS);
    expect((await get("/admin", token)).statusCode).toBe(303);
  });

  it("deletes the session on logout", async () => {
    const token = await signIn();
    const response = await post("/admin/logout", { token, fields: { _csrf: await csrfTokenOf(token) } });
    expect(response.statusCode).toBe(303);
    expect(ctx.sessions.sessions.size).toBe(0);
    expect((await get("/admin", token)).statusCode).toBe(303);
  });
});

describe("admin forms", () => {
  it("applies a change carrying the session's CSRF token", async () => {
    const token = await signIn();
    const response = await post("/admin/feedback/1/status", {
      token, fields: { _csrf: await csrfTokenOf(token), status: "resolved" },
    });
    expect(response.statusCode).toBe(303);
    expect(ctx.feedback.rows.get(1)?.status).toBe("resolved");
  });

  it("refuses a change without the CSRF token", async () => {
    const response = await post("/admin/feedback/1/status", {
      token: await signIn(), fields: { status: "resolved" },
    });
    expect(response.statusCode).toBe(403);
    expect(ctx.feedback.rows.get(1)?.status).toBe("new");
  });

  it("refuses a change posted from another origin, even with the token", async () => {
    const token = await signIn();
    const fields = { _csrf: await csrfTokenOf(token), status: "resolved" };
    const response = await post("/admin/feedback/1/status", {
      token, fields, origin: "https://evil.example",
    });
    expect(response.statusCode).toBe(403);
    expect(ctx.feedback.rows.get(1)?.status).toBe("new");
  });
});
