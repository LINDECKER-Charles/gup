import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/app-config.js";
import { createTestApp, LANDING_ORIGIN, testConfig, type TestApp } from "../support/test-app.js";

const VALID = {
  kind: "bug",
  title: "Update of Git fails",
  message: "winget exits with 1603 every time.",
};
const FORM = "application/x-www-form-urlencoded";

let ctx: TestApp | undefined;

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

async function start(config: Partial<AppConfig> = {}): Promise<TestApp> {
  ctx = await createTestApp({ config: testConfig(config) });
  return ctx;
}

function postJson(app: TestApp, payload: string | object, headers: Record<string, string> = {}) {
  return app.app.inject({
    method: "POST", url: "/api/feedback", payload,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("feedback text fields", () => {
  it.each([
    ["NUL", "\u0000"], ["escape", "\u001b[31m"], ["bell", "\u0007"], ["lone surrogate", "\ud800"],
  ])("refuses a %s character, naming the field", async (_name, character) => {
    const app = await start();
    const response = await postJson(app, { ...VALID, title: `Broken ${character}` });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid", fields: ["title"] });
  });

  it("keeps tabs and line breaks in the message", async () => {
    const app = await start();
    const message = "First line\r\n\tindented second line";
    expect((await postJson(app, { ...VALID, message })).statusCode).toBe(201);
    expect([...app.feedback.rows.values()][0]?.message).toBe(message);
  });
});

describe("feedback body limits", () => {
  it("accepts a 5000-character message in a non-Latin script, form-encoded", async () => {
    const app = await start();
    const payload = new URLSearchParams({ ...VALID, message: "語".repeat(5000) }).toString();
    expect(payload.length).toBeGreaterThan(32 * 1024);
    const response = await app.app.inject({
      method: "POST", url: "/api/feedback", payload, headers: { "content-type": FORM },
    });
    expect(response.headers.location).toContain("feedback=sent");
  });

  it("answers 413 past 64 KiB", async () => {
    const app = await start();
    const response = await postJson(app, { ...VALID, message: "x".repeat(70_000) });
    expect(response.statusCode).toBe(413);
  });

  it.each([["malformed JSON", "{\"kind\":"], ["an empty body", ""]])(
    "answers 400 on the body to %s", async (_name, payload) => {
      const app = await start();
      const response = await postJson(app, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "invalid", fields: ["body"] });
    });
});

describe("service-wide headers", () => {
  it("sends nosniff and HSTS on API answers, errors and unknown routes", async () => {
    const app = await start();
    const answers = await Promise.all([
      postJson(app, VALID),
      postJson(app, "{"),
      app.app.inject({ method: "GET", url: "/healthz" }),
      app.app.inject({ method: "GET", url: "/nowhere" }),
    ]);
    for (const answer of answers) {
      expect(answer.headers["x-content-type-options"]).toBe("nosniff");
      expect(answer.headers["strict-transport-security"]).toBe("max-age=31536000");
    }
  });

  it("sends no HSTS when the service is published over http", async () => {
    const app = await start({ publicOrigin: "http://127.0.0.1:8787" });
    const answer = await app.app.inject({ method: "GET", url: "/healthz" });
    expect(answer.headers["x-content-type-options"]).toBe("nosniff");
    expect(answer.headers["strict-transport-security"]).toBeUndefined();
  });
});

describe("TRUST_PROXY", () => {
  /** Six posts, each claiming another client address: past five, one bucket was shared. */
  async function lastOfSixPosts(app: TestApp, remoteAddress: string): Promise<number> {
    let status = 0;
    for (let index = 0; index < 6; index += 1) {
      const response = await app.app.inject({
        method: "POST", url: "/api/feedback", payload: VALID, remoteAddress,
        headers: { origin: LANDING_ORIGIN, "x-forwarded-for": `192.0.2.${index}` },
      });
      status = response.statusCode;
    }
    return status;
  }

  it("honours X-Forwarded-For from a trusted proxy", async () => {
    const app = await start({ trustProxy: ["10.0.0.0/8"] });
    expect(await lastOfSixPosts(app, "10.1.2.3")).toBe(201);
  });

  it("ignores X-Forwarded-For from any other peer", async () => {
    const app = await start({ trustProxy: ["10.0.0.0/8"] });
    expect(await lastOfSixPosts(app, "203.0.113.9")).toBe(429);
  });
});
