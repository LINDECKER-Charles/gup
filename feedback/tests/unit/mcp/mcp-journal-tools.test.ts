import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestApp } from "../../support/test-app.js";
import {
  callOk, callTool, createMcpApp, FixedInstallReader, INSTALL_ID, LEVELS, OTHER_RUN_ID, RUN_ID,
} from "./mcp-harness.js";

const UNKNOWN_INSTALL = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

let ctx: TestApp;
let journals: FixedInstallReader;

beforeEach(async () => {
  journals = new FixedInstallReader();
  ctx = await createMcpApp({ journals });
  await ctx.feedback.create({
    kind: "bug", title: "Node update fails", message: "EBUSY every time I update node.",
    email: null, installId: INSTALL_ID, gupVersion: "0.6.0", platform: "win32", locale: "fr",
  });
});

afterEach(async () => {
  await ctx.app.close();
});

describe("list_installs and get_install", () => {
  it("lists the installs with ISO dates", async () => {
    const result = await callOk(ctx.app, "list_installs", { pageSize: 5 });
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 5 });
    expect(result["items"]).toEqual([expect.objectContaining({
      id: INSTALL_ID, lastSeenAt: "2026-11-20T08:30:00.000Z",
    })]);
  });

  it("returns an install's counts, journal span and linked feedback", async () => {
    const result = await callOk(ctx.app, "get_install", { installId: INSTALL_ID.toUpperCase() });
    expect(result["install"]).toMatchObject({ id: INSTALL_ID });
    expect(result["historyBreakdown"]).toContainEqual({ kind: "update", status: "failed", count: 1 });
    expect(result["journalSpan"]).toEqual({
      oldestAt: "2026-11-20T08:01:00.000Z", newestAt: "2026-11-20T08:12:00.000Z",
      oldestReceivedAt: "2026-11-20T08:00:00.000Z", runCount: 2,
    });
    expect(result["feedback"]).toEqual([expect.objectContaining({ id: 1 })]);
  });

  it.each([
    [{ installId: UNKNOWN_INSTALL }, "No shared journals"],
    [{ installId: "not-a-uuid" }, "Input validation error"],
  ])("answers %j with a tool error", async (args, message) => {
    const result = await callTool(ctx.app, "get_install", args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(message);
  });
});

describe("list_history", () => {
  it("returns the filtered items with their full data", async () => {
    const result = await callOk(ctx.app, "list_history", {
      installId: INSTALL_ID, kind: "update", status: "failed",
    });
    expect(result).toMatchObject({ total: 1, pageSize: 50 });
    expect(result["items"]).toEqual([expect.objectContaining({
      source: "history", runId: RUN_ID, status: "failed", ts: "2026-11-20T08:12:00.000Z",
      data: { v: 1, kind: "update", package: "node", status: "failed", error: "EBUSY" },
    })]);
    expect(journals.historyQueries.at(-1)).toMatchObject({ kind: "update", status: "failed" });
  });

  it("lists both kinds when no kind is given", async () => {
    const result = await callTool(ctx.app, "list_history", { installId: INSTALL_ID });
    expect(result.structuredContent?.["total"]).toBe(3);
    expect(result.content[0]?.text).toContain('[update failed] run=run-2026-11-20-a {"v":1');
  });

  it.each([
    [{ installId: UNKNOWN_INSTALL }, "No shared journals"],
    [{ installId: INSTALL_ID, kind: "install" }, "Input validation error"],
    [{ installId: INSTALL_ID, pageSize: 501 }, "Input validation error"],
  ])("answers %j with a tool error", async (args, message) => {
    const result = await callTool(ctx.app, "list_history", args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(message);
  });
});

describe("list_logs", () => {
  it("keeps the lines up to the given level and matching the query", async () => {
    const result = await callOk(ctx.app, "list_logs", {
      installId: INSTALL_ID, maxLevel: "warn", query: " node ",
    });
    expect(result).toMatchObject({ total: 2, maxLevel: "warn", query: "node" });
    expect(result["items"]).toEqual([
      expect.objectContaining({ level: "error", event: "update.failed" }),
      expect.objectContaining({ level: "warn", event: "update.retry" }),
    ]);
    expect(journals.logQueries.at(-1)).toMatchObject({
      maxLevelRank: LEVELS.indexOf("warn"), search: "node",
    });
  });

  it("returns every level by default", async () => {
    const result = await callOk(ctx.app, "list_logs", { installId: INSTALL_ID });
    expect(result["total"]).toBe(4);
    expect(journals.logQueries.at(-1)).toMatchObject({ maxLevelRank: 4, search: null });
  });

  it.each([
    [{ installId: UNKNOWN_INSTALL }, "No shared journals"],
    [{ installId: INSTALL_ID, maxLevel: "verbose" }, "Input validation error"],
  ])("answers %j with a tool error", async (args, message) => {
    const result = await callTool(ctx.app, "list_logs", args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(message);
  });
});

describe("get_run", () => {
  it("tells the run oldest first, history and logs merged", async () => {
    const result = await callOk(ctx.app, "get_run", { installId: INSTALL_ID, runId: RUN_ID });
    expect(result["run"]).toMatchObject({
      runId: RUN_ID, startedAt: "2026-11-20T08:10:00.000Z", errorCount: 1,
    });
    const items = result["items"] as { source: string; ts: string }[];
    expect(items.map((item) => item.source)).toEqual(["history", "log", "log", "history", "log"]);
    expect(items.map((item) => item.ts)).toEqual([...items.map((item) => item.ts)].sort());
  });

  it.each([
    [{ installId: INSTALL_ID, runId: "missing" }, "holds no record of run missing"],
    [{ installId: UNKNOWN_INSTALL, runId: OTHER_RUN_ID }, "No shared journals"],
    [{ installId: INSTALL_ID, runId: "" }, "Input validation error"],
  ])("answers %j with a tool error", async (args, message) => {
    const result = await callTool(ctx.app, "get_run", args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(message);
  });
});
