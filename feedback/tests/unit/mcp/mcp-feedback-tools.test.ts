import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NewFeedback } from "../../../src/domain/feedback.js";
import type { TestApp } from "../../support/test-app.js";
import { callOk, callTool, createMcpApp, INSTALL_ID } from "./mcp-harness.js";

const BASE: NewFeedback = {
  kind: "bug", title: "Update loops", message: "gup keeps updating node every run.",
  email: "reporter@example.test", installId: null, gupVersion: "0.6.0", platform: "win32",
  locale: "fr",
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createMcpApp();
  await ctx.feedback.create({ ...BASE, installId: INSTALL_ID });
  await ctx.feedback.create({
    ...BASE, kind: "suggestion", title: "Dark theme", message: "x".repeat(600), email: null,
  });
  await ctx.feedback.create({ ...BASE, title: "Crash on scan", message: "Scan crashes on arm64." });
  await ctx.feedback.updateStatus(3, "resolved");
});

afterEach(async () => {
  await ctx.app.close();
});

describe("search_feedback", () => {
  it("lists every status by default, newest first, with the counts per status", async () => {
    const result = await callOk(ctx.app, "search_feedback");
    expect(result).toMatchObject({
      total: 3, page: 1, pageSize: 20,
      countsByStatus: { new: 2, in_progress: 0, resolved: 1, dismissed: 0 },
    });
    const items = result["items"] as { id: number; createdAt: string }[];
    expect(items.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(items[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("filters on query, kind and status, and previews long messages", async () => {
    const bugs = await callOk(ctx.app, "search_feedback", { kind: "bug", status: "new" });
    expect(bugs["total"]).toBe(1);
    const byNumber = await callOk(ctx.app, "search_feedback", { query: "  #2 " });
    const [item] = byNumber["items"] as { messagePreview: string; messageLength: number }[];
    expect(item?.messageLength).toBe(600);
    expect(item?.messagePreview.length).toBeLessThan(300);
  });

  it("renders a compact text alongside", async () => {
    const result = await callTool(ctx.app, "search_feedback", { query: "loops" });
    expect(result.content[0]?.text).toContain('#1 [new] bug');
    expect(result.content[0]?.text).toContain(`install=${INSTALL_ID}`);
  });

  it.each([
    [{ status: "closed" }],
    [{ pageSize: 101 }],
    [{ page: 0 }],
    [{ query: "q".repeat(101) }],
    [{ unknown: true }],
  ])("refuses invalid input %j as a tool error", async (args) => {
    const result = await callTool(ctx.app, "search_feedback", args);
    expect(result.isError).toBe(true);
  });
});

describe("get_feedback", () => {
  it("returns the whole feedback, note included, with its install's summary", async () => {
    await ctx.feedback.updateNote(1, "Probably the shim.");
    const result = await callOk(ctx.app, "get_feedback", { id: 1 });
    expect(result["feedback"]).toMatchObject({
      id: 1, message: BASE.message, email: BASE.email, note: "Probably the shim.",
    });
    expect(result["install"]).toMatchObject({ id: INSTALL_ID, historyCount: 3 });
  });

  it("returns a null install when none shared journals", async () => {
    const result = await callOk(ctx.app, "get_feedback", { id: 2 });
    expect(result["install"]).toBeNull();
  });

  it.each([[{ id: 99 }, "No feedback #99"], [{ id: "1" }, "Input validation error"]])(
    "answers %j with a tool error", async (args, message) => {
      const result = await callTool(ctx.app, "get_feedback", args);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(message);
    });
});

describe("update_feedback", () => {
  it("sets the status and the trimmed note, and returns the feedback", async () => {
    const result = await callOk(ctx.app, "update_feedback", {
      id: 1, status: "in_progress", note: "  Reproduced on 0.6.0.  ",
    });
    expect(result["feedback"]).toMatchObject({ status: "in_progress", note: "Reproduced on 0.6.0." });
    expect(await ctx.feedback.find(1)).toMatchObject({ status: "in_progress" });
  });

  it("changes only what it is given", async () => {
    await callOk(ctx.app, "update_feedback", { id: 3, note: "" });
    expect(await ctx.feedback.find(3)).toMatchObject({ status: "resolved", note: "" });
  });

  it.each([
    [{ id: 1 }, "Nothing to change"],
    [{ id: 1, status: "closed" }, "Input validation error"],
    [{ id: 1, note: "n".repeat(5001) }, "Input validation error"],
    [{ id: 1, note: "bell \u0007" }, "control characters"],
    [{ id: 42, status: "resolved" }, "No feedback #42"],
  ])("refuses %j", async (args, message) => {
    const result = await callTool(ctx.app, "update_feedback", args);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(message);
    expect(await ctx.feedback.find(1)).toMatchObject({ status: "new", note: "" });
  });
});
