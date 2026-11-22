import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Totp } from "../../../src/auth/totp.js";
import {
  ADMIN_PASSWORD, ADMIN_USERNAME, createTestApp, PUBLIC_ORIGIN, testConfig, type TestApp,
} from "../../support/test-app.js";

const COOKIE = "__Host-gup_admin";
const FORM = "application/x-www-form-urlencoded";
const SAME_ORIGIN = { origin: PUBLIC_ORIGIN, "content-type": FORM };
const SECRET = Buffer.from("a 20-byte TOTP key!!", "ascii");
const TOTP = new Totp(SECRET);
const MINUTE_MS = 60_000;

let ctx: TestApp;

beforeEach(async () => {
  const config = testConfig();
  ctx = await createTestApp({ config: { ...config, admin: { ...config.admin, totpSecret: SECRET } } });
});

afterEach(async () => {
  await ctx.app.close();
});

function cookieOf(response: { cookies: { name: string; value: string }[] }): string | undefined {
  return response.cookies.find((cookie) => cookie.name === COOKIE)?.value;
}

/** The password step: returns the cookie of the session awaiting its code. */
async function givePassword(): Promise<string> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/admin/login",
    payload: new URLSearchParams({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).toString(),
    headers: SAME_ORIGIN,
  });
  expect(response.statusCode).toBe(303);
  expect(response.headers.location).toBe("/admin/login/code");
  const token = cookieOf(response);
  if (token === undefined) throw new Error("no session cookie");
  return token;
}

function get(url: string, token: string) {
  return ctx.app.inject({ method: "GET", url, cookies: { [COOKIE]: token } });
}

async function csrfOfCodeForm(token: string): Promise<string> {
  const page = await get("/admin/login/code", token);
  expect(page.statusCode).toBe(200);
  return /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? "";
}

async function giveCode(token: string, code: string, csrf?: string) {
  return ctx.app.inject({
    method: "POST",
    url: "/admin/login/code",
    cookies: { [COOKIE]: token },
    payload: new URLSearchParams({ _csrf: csrf ?? await csrfOfCodeForm(token), code }).toString(),
    headers: SAME_ORIGIN,
  });
}

function currentCode(): string {
  return TOTP.codeAt(TOTP.counterAt(ctx.clock.now()));
}

describe("admin login with a second factor", () => {
  it("lets the password alone open nothing but the code form", async () => {
    const token = await givePassword();
    const inbox = await get("/admin", token);
    expect(inbox.statusCode).toBe(303);
    expect(inbox.headers.location).toBe("/admin/login");
    const form = await get("/admin/login/code", token);
    expect(form.body).toContain('autocomplete="one-time-code"');
    expect(form.body).toContain("Code à 6 chiffres");
  });

  it("opens a fresh, full session on the right code", async () => {
    const pending = await givePassword();
    const response = await giveCode(pending, currentCode());
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe("/admin");
    const token = cookieOf(response);
    expect(token).toBeDefined();
    expect(token).not.toBe(pending);
    expect((await get("/admin", token ?? "")).statusCode).toBe(200);
    expect((await get("/admin", pending)).statusCode).toBe(303);
    expect(ctx.sessions.sessions.size).toBe(1);
  });

  it("takes the code with a space in the middle, as authenticator apps show it", async () => {
    const code = currentCode();
    const response = await giveCode(await givePassword(), `${code.slice(0, 3)} ${code.slice(3)}`);
    expect(response.headers.location).toBe("/admin");
  });

  it("accepts the previous step's code, not one from two steps back", async () => {
    const counter = TOTP.counterAt(ctx.clock.now());
    const late = await giveCode(await givePassword(), TOTP.codeAt(counter - 2));
    expect(late.statusCode).toBe(401);
    const previous = await giveCode(await givePassword(), TOTP.codeAt(counter - 1));
    expect(previous.headers.location).toBe("/admin");
  });

  it("refuses a code already used to sign in", async () => {
    const code = currentCode();
    expect((await giveCode(await givePassword(), code)).headers.location).toBe("/admin");
    const replay = await giveCode(await givePassword(), code);
    expect(replay.statusCode).toBe(401);
    expect(replay.body).toContain("Code incorrect ou expiré");
  });

  it("asks for the password again after 5 wrong codes", async () => {
    const token = await givePassword();
    const csrf = await csrfOfCodeForm(token);
    for (let attempt = 1; attempt < 5; attempt += 1) {
      const wrong = await giveCode(token, "000000", csrf);
      expect(wrong.statusCode).toBe(401);
      expect(wrong.body).toContain("Code incorrect ou expiré");
    }
    const last = await giveCode(token, "000000", csrf);
    expect(last.statusCode).toBe(401);
    expect(last.body).toContain("Trop de codes incorrects");
    expect(ctx.sessions.sessions.size).toBe(0);
    const late = await giveCode(token, currentCode(), csrf);
    expect(late.headers.location).toBe("/admin/login");
  });

  it("refuses a code posted without the form's CSRF token", async () => {
    const response = await giveCode(await givePassword(), currentCode(), "forged");
    expect(response.statusCode).toBe(403);
  });

  it("forgets a password step left 5 minutes without its code", async () => {
    const token = await givePassword();
    ctx.clock.advance(5 * MINUTE_MS);
    const form = await get("/admin/login/code", token);
    expect(form.statusCode).toBe(303);
    expect(form.headers.location).toBe("/admin/login");
  });

  it("sends a visitor without a password step back to the login form", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/admin/login/code" });
    expect(response.headers.location).toBe("/admin/login");
  });

  it("shows the password form again to restart a login", async () => {
    const response = await get("/admin/login", await givePassword());
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('autocomplete="current-password"');
  });
});

describe("admin login without a second factor configured", () => {
  it("has no code step: the password signs in", async () => {
    const plain = await createTestApp();
    const response = await plain.app.inject({
      method: "POST",
      url: "/admin/login",
      payload: new URLSearchParams({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).toString(),
      headers: SAME_ORIGIN,
    });
    expect(response.headers.location).toBe("/admin");
    const code = await plain.app.inject({ method: "GET", url: "/admin/login/code" });
    expect(code.headers.location).toBe("/admin/login");
    await plain.app.close();
  });
});
