import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InstallKey } from "../../scripts/lib/install-key.js";
import { PUBLIC_ORIGIN, createTestApp, type TestApp } from "../support/test-app.js";

const EXAMPLE = JSON.parse(readFileSync(
  new URL("../../contract/log-batch.v1.example.json", import.meta.url), "utf8")) as {
  history: object[];
  logs: Record<string, unknown>[];
};
const EMPTY_BATCH = { ...EXAMPLE, history: [], logs: [] };

let ctx: TestApp;
let key: InstallKey;

beforeEach(async () => {
  ctx = await createTestApp();
  key = InstallKey.generate();
});

afterEach(async () => {
  await ctx.app.close();
});

interface Sent {
  readonly method?: "POST" | "DELETE";
  /** The raw body; a JSON payload is serialised once, so the signature covers its bytes. */
  readonly body?: string | Buffer;
  readonly signer?: InstallKey;
  readonly installId?: string;
  readonly origin?: string;
  readonly ip?: string;
}

function send(sent: Sent) {
  const method = sent.method ?? "POST";
  const installId = sent.installId ?? key.installId;
  const url = method === "POST" ? `/api/installs/${installId}/logs` : `/api/installs/${installId}`;
  const body = Buffer.from(sent.body ?? "");
  const authorization = (sent.signer ?? key).authorization({
    method, origin: sent.origin ?? PUBLIC_ORIGIN, pathname: url, body,
    signedAtMs: ctx.clock.now().getTime(),
  });
  const hasBody = body.length > 0;
  const headers = { authorization, ...(hasBody ? { "content-type": "application/json" } : {}) };
  return ctx.app.inject({
    method, url, headers, ...(hasBody ? { payload: body } : {}),
    remoteAddress: sent.ip ?? "203.0.113.7",
  });
}

function upload(batch: object, sent: Omit<Sent, "body"> = {}) {
  return send({ ...sent, body: JSON.stringify(batch) });
}

function erase(sent: Omit<Sent, "method"> = {}) {
  return send({ ...sent, method: "DELETE" });
}

function logRecord(index: number, extra: object = {}) {
  const ts = new Date(Date.UTC(2026, 10, 20, 0, 0, index)).toISOString();
  return { ...EXAMPLE.logs[1], ts, ...extra };
}

describe("POST /api/installs/:id/logs", () => {
  it("accepts the contract's example batch, signed", async () => {
    const response = await upload(EXAMPLE);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: { history: 2, logs: 2 } });
  });

  it("counts only the new items of a batch sent again", async () => {
    await upload(EXAMPLE);
    const again = await upload({ ...EXAMPLE, logs: [...EXAMPLE.logs, logRecord(1)] });
    expect(again.json()).toEqual({ accepted: { history: 0, logs: 1 } });
  });

  it("creates the install with its first non-empty batch only", async () => {
    expect((await upload(EMPTY_BATCH)).statusCode).toBe(202);
    expect(ctx.installs.installs.size).toBe(0);
    await upload(EXAMPLE);
    expect([...ctx.installs.installs.keys()]).toEqual([key.installId]);
  });

  it("refuses a request without a signature", async () => {
    const url = `/api/installs/${key.installId}/logs`;
    const response = await ctx.app.inject({ method: "POST", url, payload: EXAMPLE });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "unauthorized" });
    expect(ctx.installs.installs.size).toBe(0);
  });

  it("refuses another key's valid signature for this install's ID", async () => {
    const response = await upload(EXAMPLE, { signer: InstallKey.generate() });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a request signed for another origin", async () => {
    const response = await upload(EXAMPLE, { origin: "https://typo.example.test" });
    expect(response.statusCode).toBe(401);
  });

  it("answers 413 past a thousand items", async () => {
    const logs = Array.from({ length: 1001 }, (_, index) => logRecord(index));
    const response = await upload({ ...EXAMPLE, history: [], logs });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: "too_large" });
  });

  it("answers 413 to an item over 16 KiB", async () => {
    const response = await upload({ ...EXAMPLE, logs: [logRecord(0, { data: "x".repeat(17_000) })] });
    expect(response.statusCode).toBe(413);
  });

  it.each([
    ["a NUL character in a value", { data: "a\u0000b" }],
    ["a NUL character in a key", { "a\u0000b": 1 }],
    ["a lone surrogate in a value", { data: "\ud800" }],
    ["a lone surrogate in a nested key", { data: { "\udc00": [1] } }],
  ])("rejects an item Postgres could not store: %s", async (_name, extra) => {
    const response = await upload({ ...EXAMPLE, logs: [logRecord(0, extra)] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ fields: ["logs[0]"] });
  });

  it.each([
    ["malformed JSON", "{"],
    ["an empty body", " "],
    ["invalid UTF-8", Buffer.from([0x22, 0xff, 0x22])],
  ])("answers 400 on the body to %s", async (_name, body) => {
    const response = await send({ body });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid", fields: ["body"] });
  });

  it("answers 415 to a body that is not JSON", async () => {
    const url = `/api/installs/${key.installId}/logs`;
    const headers = { "content-type": "text/plain" };
    const response = await ctx.app.inject({ method: "POST", url, headers, payload: "hello" });
    expect(response.statusCode).toBe(415);
  });
});

describe("install rate limits", () => {
  it("allows 60 batches per hour per install, forged requests not counted", async () => {
    const forger = InstallKey.generate();
    for (let index = 0; index < 5; index += 1) {
      expect((await upload(EMPTY_BATCH, { signer: forger })).statusCode).toBe(401);
    }
    for (let index = 0; index < 60; index += 1) {
      expect((await upload(EMPTY_BATCH)).statusCode).toBe(202);
    }
    const limited = await upload(EMPTY_BATCH);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
  });

  it("allows 120 requests per hour per address, across both routes", async () => {
    const keys = Array.from({ length: 3 }, () => InstallKey.generate());
    for (let index = 0; index < 120; index += 1) {
      const signer = keys[index % keys.length] ?? key;
      const response = index % 2 === 0
        ? await upload(EMPTY_BATCH, { signer, installId: signer.installId })
        : await erase({ signer, installId: signer.installId });
      expect(response.statusCode).toBeLessThan(300);
    }
    expect((await erase()).statusCode).toBe(429);
    expect((await erase({ ip: "198.51.100.1" })).statusCode).toBe(204);
  });

  it("allows 10 new installs per hour per address, then only known ones", async () => {
    const known = InstallKey.generate();
    await upload(EXAMPLE, { signer: known, installId: known.installId });
    for (let index = 0; index < 9; index += 1) {
      const signer = InstallKey.generate();
      expect((await upload(EXAMPLE, { signer, installId: signer.installId })).statusCode).toBe(202);
    }
    const eleventh = InstallKey.generate();
    const refused = await upload(EXAMPLE, { signer: eleventh, installId: eleventh.installId });
    expect(refused.statusCode).toBe(429);
    expect(ctx.installs.installs.has(eleventh.installId)).toBe(false);
    const again = await upload(EMPTY_BATCH, { signer: known, installId: known.installId });
    expect(again.statusCode).toBe(202);
    const elsewhere = await upload(EXAMPLE, {
      signer: eleventh, installId: eleventh.installId, ip: "2001:db8:1::1",
    });
    expect(elsewhere.statusCode).toBe(202);
  });
});

describe("DELETE /api/installs/:id", () => {
  it("is idempotent: erased, then unknown, both 204", async () => {
    await upload(EXAMPLE);
    expect((await erase()).statusCode).toBe(204);
    expect(ctx.installs.installs.size).toBe(0);
    expect((await erase()).statusCode).toBe(204);
  });

  it("refuses a signature from another key and keeps the install", async () => {
    await upload(EXAMPLE);
    expect((await erase({ signer: InstallKey.generate() })).statusCode).toBe(401);
    expect(ctx.installs.installs.size).toBe(1);
  });
});
