import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { loggerOptions } from "../../../src/logger-options.js";
import { MCP_TOKEN } from "../../../src/security/mcp-token.js";
import { MemoryFeedbackRepository } from "../../support/memory-feedback-repository.js";
import { createTestApp, PUBLIC_ORIGIN, type TestApp } from "../../support/test-app.js";
import { createMcpApp, rpc, TOKEN } from "./mcp-harness.js";

const TOOL_NAMES = [
  "search_feedback", "get_feedback", "update_feedback", "list_installs", "get_install",
  "list_history", "list_logs", "get_run",
];

let ctx: TestApp | null = null;

afterEach(async () => {
  await ctx?.app.close();
  ctx = null;
});

describe("MCP endpoint", () => {
  it("refuses every request while no access is issued", async () => {
    ctx = await createTestApp();
    const response = await rpc(ctx.app, { method: "tools/list" });
    expect(response.statusCode).toBe(401);
  });

  it.each([
    ["no Authorization header", null],
    ["a malformed token", "not-the-token"],
    ["a well-formed token no access holds", MCP_TOKEN.create()],
    ["the right token with a suffix", `${TOKEN}x`],
    ["the right token in another case", TOKEN.toUpperCase()],
  ])("answers 401 with a Bearer challenge to %s", async (_name, token) => {
    ctx = await createMcpApp();
    const response = await rpc(ctx.app, { method: "tools/list", token });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("refuses another scheme carrying the right token", async () => {
    ctx = await createMcpApp();
    const response = await rpc(ctx.app, {
      method: "tools/list", token: null, headers: { authorization: `Basic ${TOKEN}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses any request with an Origin header, even with the right token", async () => {
    ctx = await createMcpApp();
    const response = await rpc(ctx.app, {
      method: "tools/list", headers: { origin: PUBLIC_ORIGIN },
    });
    expect(response.statusCode).toBe(403);
  });

  it("answers GET and DELETE with 405: it is stateless", async () => {
    ctx = await createMcpApp();
    const headers = { authorization: `Bearer ${TOKEN}` };
    for (const method of ["GET", "DELETE"] as const) {
      const response = await ctx.app.inject({ method, url: "/mcp", headers });
      expect(response.statusCode).toBe(405);
      expect(response.headers.allow).toBe("POST");
    }
  });

  it("accepts JSON bodies only", async () => {
    ctx = await createMcpApp();
    const response = await ctx.app.inject({
      method: "POST", url: "/mcp", payload: "tools/list",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/plain" },
    });
    expect(response.statusCode).toBe(415);
  });

  it("initializes without a session and answers JSON, never cached", async () => {
    ctx = await createMcpApp();
    const response = await rpc(ctx.app, {
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18", capabilities: {},
        clientInfo: { name: "claude-code", version: "test" },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["mcp-session-id"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    const { result } = response.json();
    expect(result.serverInfo.name).toBe("gup-feedback");
    expect(result.capabilities.tools).toBeDefined();
    expect(result.instructions).toContain("update_feedback");
  });

  it("acknowledges notifications with 202", async () => {
    ctx = await createMcpApp();
    const response = await ctx.app.inject({
      method: "POST", url: "/mcp",
      headers: {
        authorization: `Bearer ${TOKEN}`, "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(response.statusCode).toBe(202);
  });

  it("lists the tools with bounded, strict input schemas", async () => {
    ctx = await createMcpApp();
    const response = await rpc(ctx.app, { method: "tools/list" });
    const tools = response.json().result.tools as {
      name: string; description: string;
      inputSchema: { properties: Record<string, { maximum?: number }>; additionalProperties?: boolean };
      annotations: { readOnlyHint: boolean };
    }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.annotations.readOnlyHint).toBe(tool.name !== "update_feedback");
    }
    const logs = tools.find((tool) => tool.name === "list_logs");
    expect(logs?.inputSchema.properties["pageSize"]?.maximum).toBe(500);
  });

  it("limits failed authentications per address, then refuses even the right token", async () => {
    ctx = await createMcpApp();
    const ip = "203.0.113.50";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await rpc(ctx.app, { method: "tools/list", token: "guess", ip });
      expect(response.statusCode).toBe(401);
    }
    const limited = await rpc(ctx.app, { method: "tools/list", ip });
    expect(limited.statusCode).toBe(429);
    const elsewhere = await rpc(ctx.app, { method: "tools/list", ip: "203.0.113.51" });
    expect(elsewhere.statusCode).toBe(200);
  });

  it("never writes the token to the logs", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const feedback = new MemoryFeedbackRepository();
    feedback.find = async () => {
      throw new Error("database is down");
    };
    ctx = await createMcpApp({ feedback, logger: { ...loggerOptions("trace"), stream } });
    await rpc(ctx.app, { method: "tools/list" });
    await rpc(ctx.app, { method: "tools/list", token: `${TOKEN}-wrong` });
    const failed = await rpc(ctx.app, {
      method: "tools/call", params: { name: "get_feedback", arguments: { id: 1 } },
    });
    expect(failed.json().result).toMatchObject({ isError: true });
    const log = lines.join("");
    expect(log).toContain("MCP tool failed");
    expect(log).toContain("database is down");
    expect(log).not.toContain(TOKEN);
  });
});
