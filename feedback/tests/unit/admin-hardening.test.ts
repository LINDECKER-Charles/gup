import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD, ADMIN_USERNAME, createTestApp, PUBLIC_ORIGIN, type TestApp,
} from "../support/test-app.js";

const COOKIE = "__Host-gup_admin";
const FORM = "application/x-www-form-urlencoded";

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

function login(headers: Record<string, string>, remoteAddress = "203.0.113.7") {
  return ctx.app.inject({
    method: "POST",
    url: "/admin/login",
    payload: new URLSearchParams({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).toString(),
    headers: { "content-type": FORM, ...headers },
    remoteAddress,
  });
}

async function signIn(): Promise<{ token: string; csrf: string }> {
  const response = await login({ origin: PUBLIC_ORIGIN });
  const token = response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? "";
  const page = await ctx.app.inject({ method: "GET", url: "/admin", cookies: { [COOKIE]: token } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? "";
  return { token, csrf };
}

function postNote(
  session: { token: string; csrf: string },
  note: string,
  headers: Record<string, string> = { origin: PUBLIC_ORIGIN },
) {
  return ctx.app.inject({
    method: "POST",
    url: "/admin/feedback/1/note",
    cookies: { [COOKIE]: session.token },
    payload: new URLSearchParams({ _csrf: session.csrf, note }).toString(),
    headers: { "content-type": FORM, ...headers },
  });
}

/** What browsers send on a form post, depending on their Referrer-Policy and privacy settings. */
const BROWSER_ORIGINS = [
  ["the page's own origin", { origin: PUBLIC_ORIGIN }, 303],
  ["only a same-origin Referer", { referer: `${PUBLIC_ORIGIN}/admin/login` }, 303],
  ["Origin: null (what no-referrer causes)", { origin: "null" }, 403],
  ["neither Origin nor Referer", {}, 403],
  ["a foreign Referer", { referer: "https://evil.example/admin/login" }, 403],
] as const;

describe("back-office headers", () => {
  it("sends a same-origin Referrer-Policy, so its own form posts keep their Origin", async () => {
    const page = await ctx.app.inject({ method: "GET", url: "/admin/login" });
    // `no-referrer` makes browsers send `Origin: null`, which the guard refuses.
    expect(page.headers["referrer-policy"]).toBe("same-origin");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
    expect(page.headers["strict-transport-security"]).toBe("max-age=31536000");
  });
});

describe("same-origin check, as browsers send it", () => {
  it.each(BROWSER_ORIGINS)("on login, with %s", async (_name, headers, status) => {
    expect((await login(headers)).statusCode).toBe(status);
  });

  it.each(BROWSER_ORIGINS)("on a note, with %s", async (_name, headers, status) => {
    const session = await signIn();
    expect((await postNote(session, "Seen.", headers)).statusCode).toBe(status);
  });
});

describe("login rate limits", () => {
  it("stops every login after 100 attempts in an hour, whatever the address", async () => {
    for (let index = 0; index < 100; index += 1) {
      const response = await login({ origin: "https://evil.example" }, `198.51.100.${index}`);
      expect(response.statusCode).toBe(403);
    }
    const legitimate = await login({ origin: PUBLIC_ORIGIN }, "192.0.2.1");
    expect(legitimate.statusCode).toBe(429);
    expect(legitimate.body).toContain("Trop de tentatives");
  });
});

describe("private note", () => {
  it("keeps tabs and line breaks", async () => {
    const session = await signIn();
    expect((await postNote(session, "first\tline\r\nsecond")).statusCode).toBe(303);
    expect(ctx.feedback.rows.get(1)?.note).toBe("first\tline\r\nsecond");
  });

  it("refuses other control characters", async () => {
    const session = await signIn();
    expect((await postNote(session, "bell\u0007")).statusCode).toBe(400);
    expect(ctx.feedback.rows.get(1)?.note).toBe("");
  });

  it("accepts a full-length note in a non-Latin script, refuses a body over 64 KiB", async () => {
    const session = await signIn();
    expect((await postNote(session, "語".repeat(5000))).statusCode).toBe(303);
    expect((await postNote(session, "x".repeat(70_000))).statusCode).toBe(413);
  });
});
