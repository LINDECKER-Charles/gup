import { describe, expect, it } from "vitest";
import {
  MAX_DEPTH,
  MAX_ITEMS,
  MAX_KEYS,
  MAX_STRING,
  MAX_TOTAL_CHARS,
  resanitizeRecord,
  sanitizeContext,
  sanitizeData,
} from "../../../src/core/log/sanitize-data.js";
import type { LogRecord } from "../../../src/core/log/types.js";

describe("sanitizeData", () => {
  it("copies JSON values and drops what has no JSON form", () => {
    expect(
      sanitizeData({
        text: "ok",
        count: 3,
        flag: false,
        none: null,
        missing: undefined,
        callback: () => 1,
        id: Symbol("x"),
        big: 10n,
        nan: Number.NaN,
        at: new Date("2026-10-03T12:00:00.000Z"),
      }),
    ).toEqual({
      text: "ok",
      count: 3,
      flag: false,
      none: null,
      big: "10",
      nan: "NaN",
      at: "2026-10-03T12:00:00.000Z",
    });
  });

  it("returns undefined for nothing, an empty bag, or a value that is not a bag", () => {
    expect(sanitizeData(undefined)).toBeUndefined();
    expect(sanitizeData({})).toBeUndefined();
    expect(sanitizeData("text")).toBeUndefined();
    expect(sanitizeData([1, 2])).toBeUndefined();
  });

  it("redacts every string and masks values under a secret-looking key", () => {
    expect(
      sanitizeData({
        line: "push https://bob:pw@example.com",
        nested: { password: { anything: 1 }, Authorization: "Basic dXNlcjpwYXNz" },
      }),
    ).toEqual({ line: "push https://***@example.com", nested: { password: "***", Authorization: "***" } });
  });

  it("turns an Error into its name, message and stack", () => {
    const error = new TypeError("boom token=abc");
    const data = sanitizeData({ error });
    expect(data).toEqual({
      error: { name: "TypeError", message: "boom token=***", stack: expect.any(String) },
    });
  });

  it("bounds strings, keys, items, depth and the record's total text", () => {
    const wide = Object.fromEntries(Array.from({ length: MAX_KEYS + 5 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeData(wide) ?? {})).toHaveLength(MAX_KEYS);
    const items = sanitizeData({ list: Array.from({ length: MAX_ITEMS + 5 }, (_, i) => i) });
    expect(items?.["list"]).toHaveLength(MAX_ITEMS);
    const long = sanitizeData({ s: "x".repeat(MAX_STRING + 10) })?.["s"] as string;
    expect(long.startsWith("x".repeat(MAX_STRING))).toBe(true);
    expect(long.length).toBeLessThan(MAX_STRING + 20);
    let deep: unknown = "leaf";
    for (let i = 0; i < MAX_DEPTH + 2; i++) deep = { deeper: deep };
    expect(JSON.stringify(sanitizeData({ deep }))).toContain('"…"');
    const many = Object.fromEntries(Array.from({ length: MAX_KEYS }, (_, i) => [`s${i}`, "y".repeat(MAX_STRING)]));
    expect(JSON.stringify(sanitizeData(many)).length).toBeLessThan(MAX_TOTAL_CHARS + MAX_KEYS * 40);
  });

  it("never copies a prototype key, and names a class instance instead of stringifying it", () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as unknown;
    const data = sanitizeData(hostile);
    expect(data).toEqual({ ok: 1 });
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(sanitizeData({ map: new Map([["a", 1]]) })).toEqual({ map: "[object Map]" });
  });
});

describe("sanitizeContext and resanitizeRecord", () => {
  it("keep the known context fields, bounded and redacted", () => {
    const ctx = { op: "update", providerId: "npm-g", packageId: `a${"b".repeat(400)}`, extra: 1 } as const;
    const clean = sanitizeContext(ctx);
    expect(Object.keys(clean)).toEqual(["op", "providerId", "packageId"]);
    expect(clean.packageId!.length).toBeLessThan(300);
  });

  it("apply the redaction again to a record read back", () => {
    const record: LogRecord = {
      v: 1,
      ts: "2026-10-03T12:00:00.000Z",
      level: "warn",
      event: "cmd.end",
      runId: "r",
      pid: 1,
      ctx: { op: "scan", providerId: "npm-g" },
      data: { stderrTail: "npm ERR! //registry/:_authToken=npm_" + "x".repeat(36) },
    };
    expect(resanitizeRecord(record)).toEqual({ ...record, data: { stderrTail: "npm ERR! //registry/:_authToken=***" } });
  });
});
