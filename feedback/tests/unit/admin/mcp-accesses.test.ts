import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../../../src/security/sha256.js";
import { DURATION_MS } from "../../../src/time-units.js";
import { AdminSession } from "../../support/admin-session.js";
import { createTestApp, type TestApp } from "../../support/test-app.js";

const MCP = "/admin/mcp";
const TOKEN_PAGE = "/admin/mcp/token";
const HOSTILE = `"'><script>alert(1)</script>`;
const TOKEN_PATTERN = /gupmcp_[A-Za-z0-9_-]{43}/;
const VALID = { name: "Claude Code, portable", permissions: ["feedback:triage"], lifetime: "7" };

let ctx: TestApp;

afterEach(async () => {
  await ctx.app.close();
});

async function open(): Promise<AdminSession> {
  ctx = await createTestApp();
  return AdminSession.open(ctx.app);
}

function noticeOf(response: { headers: Record<string, unknown> }): string | null {
  const location = String(response.headers["location"] ?? "");
  return new URL(location, "http://x").searchParams.get("ok");
}

/** Issues an access through the form and reads its token off the one page that shows it. */
async function issue(admin: AdminSession, fields: Record<string, string | string[]> = VALID) {
  const issued = await admin.post(MCP, fields);
  expect(issued.statusCode).toBe(303);
  expect(issued.headers["location"]).toBe(TOKEN_PAGE);
  const page = await admin.get(TOKEN_PAGE);
  expect(page.statusCode).toBe(200);
  const token = TOKEN_PATTERN.exec(page.body)?.[0] ?? "";
  expect(token).not.toBe("");
  return { token, page };
}

/** The registration command as a copy of the block gives it: its parts, entities decoded. */
function commandOf(body: string): string {
  const block = /<pre class="command"><code>(.*?)<\/code><\/pre>/s.exec(body)?.[1] ?? "";
  const parts = [...block.matchAll(/<span class="command__part">([^<]*)<\/span>/g)];
  return parts.map((part) => part[1]).join(" ").replaceAll("&#39;", "'");
}

function mcpCall(token: string) {
  return ctx.app.inject({
    method: "POST", url: "/mcp",
    headers: {
      authorization: `Bearer ${token}`, "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  });
}

describe("MCP tab", () => {
  it("says no access is active, and how to issue one", async () => {
    const admin = await open();
    const page = await admin.get(MCP);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Aucun accès actif");
    expect(page.body).toMatch(/href="\/admin\/mcp" aria-current="page"/);
    expect(commandOf(page.body)).toBe("claude mcp add --transport http --scope user "
      + "gup-feedback-dev https://feedback.example.test/mcp "
      + "--header 'Authorization: Bearer ${GUP_FEEDBACK_DEV_MCP_TOKEN}'");
  });

  it("issues an access, shows its token once, and stores only its digest", async () => {
    const admin = await open();
    const { token, page } = await issue(admin);
    expect(page.body).toContain("Claude Code, portable");
    const [stored] = ctx.mcpAccesses.stored();
    expect(stored?.tokenDigest).toEqual(sha256(token));
    expect(stored?.permissions).toEqual(["feedback:read", "feedback:triage"]);
    expect(stored?.expiresAt.getTime()).toBe(ctx.clock.now().getTime() + 7 * DURATION_MS.day);
    expect(JSON.stringify(stored)).not.toContain(token);
    const again = await admin.get(TOKEN_PAGE);
    expect(noticeOf(again)).toBe("token-gone");
    const list = await admin.get(MCP);
    expect(list.body).not.toContain(token);
    expect(list.body).toContain(`gupmcp_…${token.slice(-4)}`);
    expect((await mcpCall(token)).statusCode).toBe(200);
  });

  it("shows the token to the session that issued it, and only for a few minutes", async () => {
    const admin = await open();
    const other = await AdminSession.open(ctx.app);
    await admin.post(MCP, VALID);
    expect(noticeOf(await other.get(TOKEN_PAGE))).toBe("token-gone");
    ctx.clock.advance(11 * DURATION_MS.minute);
    expect(noticeOf(await admin.get(TOKEN_PAGE))).toBe("token-gone");
    await expect.poll(() => ctx.mcpAccesses.stored()[0]?.revokedAt).not.toBeNull();
  });

  it("revokes an access whose token was never shown, replaced by a second issue", async () => {
    const admin = await open();
    await admin.post(MCP, { ...VALID, name: "First, never shown" });
    const { token } = await issue(admin, { ...VALID, name: "Second" });
    await expect.poll(() => ctx.mcpAccesses.stored()[0]?.revokedAt).not.toBeNull();
    expect(ctx.mcpAccesses.stored()[1]?.revokedAt).toBeNull();
    expect((await mcpCall(token)).statusCode).toBe(200);
  });

  it("revokes the accesses still waiting to be shown when the service stops", async () => {
    const admin = await open();
    await admin.post(MCP, VALID);
    await ctx.app.close();
    expect(ctx.mcpAccesses.stored()[0]?.revokedAt).not.toBeNull();
  });

  it.each([
    ["no name", { ...VALID, name: "  " }, "Donnez un nom"],
    ["a name too long", { ...VALID, name: "x".repeat(81) }, "80 caractères au plus"],
    ["no permission", { name: "x", lifetime: "30" }, "Cochez au moins une permission"],
    ["an unknown permission", { ...VALID, permissions: ["admin:all"] }, "Cochez au moins"],
    ["a lifetime not offered", { ...VALID, lifetime: "3650" }, "Choisissez une durée"],
  ])("refuses %s with 422 and issues nothing", async (_name, fields, message) => {
    const admin = await open();
    const response = await admin.post(MCP, fields);
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain(message);
    expect(response.body).toMatch(/<p class="field-error" id="access-[a-z]+-error">/);
    expect(response.body).toContain("autofocus");
    expect(ctx.mcpAccesses.stored()).toHaveLength(0);
  });

  it("escapes a name, in the form it shows back and in the list", async () => {
    const admin = await open();
    const refused = await admin.post(MCP, { name: HOSTILE, lifetime: "30" });
    expect(refused.statusCode).toBe(422);
    expect(refused.body).not.toContain(HOSTILE);
    await issue(admin, { ...VALID, name: HOSTILE });
    const list = await admin.get(MCP);
    expect(list.body).not.toContain(HOSTILE);
    expect(list.body).toContain("&lt;script&gt;");
  });

  it("revokes an access once confirmed: its token stops at once", async () => {
    const admin = await open();
    const { token } = await issue(admin);
    const id = ctx.mcpAccesses.stored()[0]?.id ?? "";
    expect((await admin.post(`${MCP}/${id}/revoke`)).statusCode).toBe(400);
    const revoked = await admin.post(`${MCP}/${id}/revoke`, { confirm: "yes" });
    expect(noticeOf(revoked)).toBe("access-revoked");
    expect((await mcpCall(token)).statusCode).toBe(401);
    const again = await admin.post(`${MCP}/${id}/revoke`, { confirm: "yes" });
    expect(noticeOf(again)).toBe("access-inactive");
    const list = await admin.get(MCP);
    expect(list.body).toContain("Expirés ou révoqués");
    expect(list.body).toContain("Révoqué le");
  });

  it("answers 404 to a revocation of a malformed ID", async () => {
    const admin = await open();
    const response = await admin.post(`${MCP}/not-an-id/revoke`, { confirm: "yes" });
    expect(response.statusCode).toBe(404);
  });

  it("refuses to issue or revoke without the session's CSRF token", async () => {
    const admin = await open();
    expect((await admin.post(MCP, { ...VALID, _csrf: "forged" })).statusCode).toBe(403);
    expect(ctx.mcpAccesses.stored()).toHaveLength(0);
  });

  it("moves an access to the history once it expires", async () => {
    const admin = await open();
    const now = ctx.clock.now().getTime();
    await ctx.mcpAccesses.create({
      id: "5b0e6a4c-2f1d-4e8b-9c7a-1d2e3f4a5b6c", name: "Expired yesterday",
      permissions: ["feedback:read"], tokenHint: "abcd", tokenDigest: sha256("expired"),
      createdAt: new Date(now - 2 * DURATION_MS.day), expiresAt: new Date(now - DURATION_MS.day),
    });
    const list = await admin.get(MCP);
    expect(list.body).toContain("Aucun accès actif");
    expect(list.body).toContain("Expiré le");
    expect(list.body).not.toContain("Révoquer cet accès");
  });
});
