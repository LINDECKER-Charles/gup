import { beforeEach, describe, expect, it, vi } from "vitest";

type RunContextModule = typeof import("../../../src/core/state/run-context.js");

let context: RunContextModule;

/** The trigger is process-wide state: each case starts from a fresh module. */
beforeEach(async () => {
  vi.resetModules();
  context = await import("../../../src/core/state/run-context.js");
});

describe("run identity", () => {
  it("is one UUID for the whole process", async () => {
    expect(context.RUN_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const again = await import("../../../src/core/state/run-context.js");
    expect(again.RUN_ID).toBe(context.RUN_ID);
  });

  it("has no trigger until the CLI startup records one", () => {
    expect(context.runTrigger()).toBeUndefined();
    context.setRunTrigger("schedule");
    expect(context.runTrigger()).toBe("schedule");
  });
});

describe("operation context", () => {
  it("is undefined outside of any operation", () => {
    expect(context.currentOperation()).toBeUndefined();
  });

  it("follows the work across awaits and returns its result", async () => {
    const seen = await context.withOperation({ op: "update", providerId: "npm-g", packageId: "x" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return context.currentOperation();
    });
    expect(seen).toEqual({ op: "update", providerId: "npm-g", packageId: "x" });
    expect(context.currentOperation()).toBeUndefined();
  });

  it("keeps concurrent operations apart", async () => {
    const observe = (providerId: string, delayMs: number) =>
      context.withOperation({ op: "scan", providerId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return context.currentOperation()?.providerId;
      });
    await expect(Promise.all([observe("a", 5), observe("b", 1), observe("c", 3)])).resolves.toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("lets an inner operation shadow the outer one only for its own work", () => {
    context.withOperation({ op: "scan", providerId: "outer" }, () => {
      context.withOperation({ op: "detect", providerId: "inner" }, () => {
        expect(context.currentOperation()?.providerId).toBe("inner");
      });
      expect(context.currentOperation()?.providerId).toBe("outer");
    });
  });
});
