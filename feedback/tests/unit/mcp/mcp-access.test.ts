import {
  CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import type { NewFeedback } from "../../../src/domain/feedback.js";
import type { McpPermission } from "../../../src/domain/mcp-access.js";
import { MCP_TOKEN } from "../../../src/security/mcp-token.js";
import { DURATION_MS } from "../../../src/time-units.js";
import type { TestApp } from "../../support/test-app.js";
import { createMcpApp, grantAccess, INSTALL_ID, rpc, TOKEN } from "./mcp-harness.js";

const FEEDBACK: NewFeedback = {
  kind: "bug", title: "Update loops", message: "gup keeps updating node every run.",
  email: "reporter@example.test", installId: INSTALL_ID, gupVersion: "0.6.0", platform: "win32",
  locale: "fr",
};

const TOOLS_OF: Readonly<Record<McpPermission, readonly string[]>> = {
  "feedback:read": ["get_feedback", "search_feedback"],
  "feedback:triage": ["update_feedback"],
  "journals:read": ["get_install", "get_run", "list_history", "list_installs", "list_logs"],
};

let ctx: TestApp | null = null;

afterEach(async () => {
  await ctx?.app.close();
  ctx = null;
});

async function toolNames(app: TestApp["app"], token = TOKEN): Promise<string[]> {
  const response = await rpc(app, { method: "tools/list", token });
  expect(response.statusCode).toBe(200);
  return (response.json().result.tools as { name: string }[]).map((tool) => tool.name).sort();
}

const MODERN_ERA = "2026-07-28";

/** tools/list in the 2026-07-28 per-request envelope: the SDK handler's path, not the legacy one. */
async function modernToolNames(app: TestApp["app"]): Promise<string[]> {
  const response = await rpc(app, {
    method: "tools/list",
    headers: { "mcp-protocol-version": MODERN_ERA, "mcp-method": "tools/list" },
    params: {
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: MODERN_ERA,
        [CLIENT_INFO_META_KEY]: { name: "test", version: "1" },
        [CLIENT_CAPABILITIES_META_KEY]: {},
      },
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return (response.json().result.tools as { name: string }[]).map((tool) => tool.name).sort();
}

async function call(app: TestApp["app"], name: string, args: Record<string, unknown>) {
  const response = await rpc(app, { method: "tools/call", params: { name, arguments: args } });
  return response.json() as {
    result?: { isError?: boolean; content: { text: string }[];
      structuredContent?: Record<string, unknown> };
    error?: unknown;
  };
}

describe("MCP access lifecycle", () => {
  it("stops answering a token once its access expires", async () => {
    ctx = await createMcpApp();
    expect((await rpc(ctx.app, { method: "tools/list" })).statusCode).toBe(200);
    ctx.clock.advance(DURATION_MS.day);
    const response = await rpc(ctx.app, { method: "tools/list" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
  });

  it("stops answering a token once its access is revoked, and leaves the others", async () => {
    ctx = await createMcpApp();
    const other = MCP_TOKEN.create();
    const otherId = await grantAccess(ctx, { token: other });
    await ctx.mcpAccesses.revoke(otherId, ctx.clock.now());
    expect((await rpc(ctx.app, { method: "tools/list", token: other })).statusCode).toBe(401);
    expect((await rpc(ctx.app, { method: "tools/list" })).statusCode).toBe(200);
  });

  it("records each access's last use, and only on success", async () => {
    ctx = await createMcpApp();
    const [access] = ctx.mcpAccesses.stored();
    expect(access?.lastUsedAt).toBeNull();
    ctx.clock.advance(DURATION_MS.minute);
    await rpc(ctx.app, { method: "tools/list" });
    expect(ctx.mcpAccesses.stored()[0]?.lastUsedAt).toEqual(ctx.clock.now());
    ctx.clock.advance(DURATION_MS.minute);
    await rpc(ctx.app, { method: "tools/list", token: `${TOKEN}x` });
    expect(ctx.mcpAccesses.stored()[0]?.lastUsedAt).not.toEqual(ctx.clock.now());
  });
});

describe("MCP permissions", () => {
  it.each([
    [["feedback:read"]],
    [["feedback:read", "feedback:triage"]],
    [["journals:read"]],
    [["feedback:read", "feedback:triage", "journals:read"]],
  ] as McpPermission[][][])("lists the tools of %j and no other, in both eras", async (permissions) => {
    ctx = await createMcpApp({}, permissions);
    const expected = permissions.flatMap((permission) => TOOLS_OF[permission]).sort();
    expect(await toolNames(ctx.app)).toEqual(expected);
    expect(await modernToolNames(ctx.app)).toEqual(expected);
  });

  it("brings reading with triage, whatever the stored row says", async () => {
    ctx = await createMcpApp({}, ["feedback:triage"]);
    expect(await toolNames(ctx.app)).toEqual(
      ["get_feedback", "search_feedback", "update_feedback"]);
  });

  it("leaves the feedback count out of the installs without feedback:read", async () => {
    ctx = await createMcpApp({}, ["journals:read"]);
    for (const [name, args] of [["list_installs", {}], ["get_install", { installId: INSTALL_ID }]]) {
      const { result } = await call(ctx.app, String(name), args as Record<string, unknown>);
      expect(JSON.stringify(result?.structuredContent)).toContain("\"feedbackCount\":null");
      expect(result?.content[0]?.text).not.toMatch(/\d+ feedback/);
    }
  });

  it("says what the access may do in the server's instructions", async () => {
    ctx = await createMcpApp({}, ["journals:read"]);
    const response = await rpc(ctx.app, {
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {},
        clientInfo: { name: "test", version: "1" } },
    });
    const { instructions } = response.json().result as { instructions: string };
    expect(instructions).toContain("This access may: read shared journals.");
  });

  it("refuses a call to a tool outside the access's permissions", async () => {
    ctx = await createMcpApp({}, ["feedback:read"]);
    await ctx.feedback.create(FEEDBACK);
    const body = await call(ctx.app, "update_feedback", { id: 1, status: "resolved" });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect((await ctx.feedback.find(1))?.status).toBe("new");
  });

  it("leaves the journals out of get_feedback without journals:read", async () => {
    ctx = await createMcpApp({}, ["feedback:read"]);
    await ctx.feedback.create(FEEDBACK);
    const { result } = await call(ctx.app, "get_feedback", { id: 1 });
    expect(result?.structuredContent).toMatchObject({ install: null });
    expect(result?.content[0]?.text).toContain("outside this access's permissions");
  });

  it("leaves the feedback out of get_install without feedback:read", async () => {
    ctx = await createMcpApp({}, ["journals:read"]);
    await ctx.feedback.create(FEEDBACK);
    const { result } = await call(ctx.app, "get_install", { installId: INSTALL_ID });
    expect(result?.structuredContent).toMatchObject({ feedback: null });
    expect(result?.content[0]?.text).toContain("outside this access's permissions");
    expect(result?.content[0]?.text).not.toContain(FEEDBACK.title);
  });
});
