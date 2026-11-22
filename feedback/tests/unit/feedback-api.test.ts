import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, LANDING_ORIGIN, LANDING_URL, type TestApp } from "../support/test-app.js";

const VALID = {
  kind: "bug",
  title: "Update of Git fails",
  message: "winget exits with 1603 every time.",
  email: "someone@example.com",
  installId: "8C1D4F2E-3B5A-4C6D-8E7F-9A0B1C2D3E4F",
  platform: "win32",
};
const FORM = "application/x-www-form-urlencoded";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.app.close();
});

function postJson(payload: object, headers: Record<string, string> = {}) {
  return ctx.app.inject({ method: "POST", url: "/api/feedback", payload, headers });
}

function postForm(fields: Record<string, string>) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/feedback",
    payload: new URLSearchParams(fields).toString(),
    headers: { "content-type": FORM },
  });
}

describe("POST /api/feedback (JSON)", () => {
  it("stores a valid feedback and answers its id", async () => {
    const response = await postJson(VALID);
    expect(response.statusCode).toBe(201);
    const { id } = response.json<{ id: number }>();
    expect(ctx.feedback.rows.get(id)).toMatchObject({
      title: VALID.title, installId: VALID.installId.toLowerCase(), status: "new",
    });
  });

  it("rejects missing and malformed fields, naming them", async () => {
    const response = await postJson({ kind: "praise", title: "x", email: "not-an-address" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid",
      fields: expect.arrayContaining(["kind", "title", "message", "email"]),
    });
    expect(ctx.feedback.rows.size).toBe(0);
  });

  it("pretends to accept a filled honeypot and stores nothing", async () => {
    const response = await postJson({ ...VALID, website: "https://spam.example" });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 0 });
    expect(ctx.feedback.rows.size).toBe(0);
  });

  it("drops a form filled in under three seconds", async () => {
    const startedAt = ctx.clock.now().getTime() - 1000;
    await postJson({ ...VALID, startedAt });
    expect(ctx.feedback.rows.size).toBe(0);
  });

  it("keeps a feedback whose startedAt is in the future (a clock ahead)", async () => {
    const startedAt = ctx.clock.now().getTime() + 60_000;
    await postJson({ ...VALID, startedAt });
    expect(ctx.feedback.rows.size).toBe(1);
  });

  it("answers 415 to a content type it does not read", async () => {
    const response = await ctx.app.inject({
      method: "POST", url: "/api/feedback", payload: "<feedback/>", headers: { "content-type": "application/xml" },
    });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: "unsupported_media_type" });
  });

  it("limits a client to five posts per ten minutes", async () => {
    for (let i = 0; i < 5; i += 1) expect((await postJson(VALID)).statusCode).toBe(201);
    const limited = await postJson(VALID);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
  });
});

describe("POST /api/feedback (no-JavaScript form)", () => {
  const fields = { ...VALID, returnTo: `${LANDING_ORIGIN}/gup/fr/` };

  it("redirects back to an allowed returnTo with the outcome", async () => {
    const response = await postForm(fields);
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(`${LANDING_ORIGIN}/gup/fr/?feedback=sent#feedback`);
    expect(ctx.feedback.rows.size).toBe(1);
  });

  it("never redirects to a foreign origin", async () => {
    const response = await postForm({ ...fields, returnTo: "https://evil.example/" });
    expect(response.headers.location).toBe(`${LANDING_URL}?feedback=sent#feedback`);
  });

  it("redirects with feedback=invalid when fields are wrong", async () => {
    const response = await postForm({ ...fields, title: "" });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toContain("feedback=invalid");
  });

  it("redirects with feedback=limited past the rate limit", async () => {
    for (let i = 0; i < 5; i += 1) await postForm(fields);
    const response = await postForm(fields);
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toContain("feedback=limited");
  });
});

describe("CORS on /api/feedback", () => {
  it("allows the landing's origin", async () => {
    const preflight = await ctx.app.inject({
      method: "OPTIONS",
      url: "/api/feedback",
      headers: { origin: LANDING_ORIGIN, "access-control-request-method": "POST" },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(LANDING_ORIGIN);
    const post = await postJson(VALID, { origin: LANDING_ORIGIN });
    expect(post.headers["access-control-allow-origin"]).toBe(LANDING_ORIGIN);
  });

  it("grants nothing to another origin", async () => {
    const post = await postJson(VALID, { origin: "https://evil.example" });
    expect(post.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
