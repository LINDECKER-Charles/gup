import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listLogFiles,
  MAX_LINE_LENGTH,
  parseLogLine,
  readLogTail,
} from "../../../src/core/log/log-reader.js";
import type { LogRecord } from "../../../src/core/log/types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gup-log-reader-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function record(ts: string, over: Partial<LogRecord> = {}): LogRecord {
  return { v: 1, ts, level: "info", event: "scan.start", runId: "run-1", pid: 10, ...over };
}

function writeLog(name: string, records: readonly (LogRecord | string)[]): void {
  const lines = records.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)));
  writeFileSync(join(dir, name), `${lines.join("\n")}\n`);
}

describe("listLogFiles", () => {
  it("lists log files newest first, by day then part, and nothing else", async () => {
    writeLog("gup-2026-10-02.jsonl", []);
    writeLog("gup-2026-10-03.jsonl", []);
    writeLog("gup-2026-10-03.1.jsonl", []);
    writeFileSync(join(dir, "notes.txt"), "x");
    mkdirSync(join(dir, "gup-2026-10-04.jsonl"));
    const files = await listLogFiles(dir);
    expect(files.map((file) => file.name)).toEqual([
      "gup-2026-10-03.1.jsonl",
      "gup-2026-10-03.jsonl",
      "gup-2026-10-02.jsonl",
    ]);
    expect(files[0]).toMatchObject({ day: "2026-10-03", part: 1, path: join(dir, "gup-2026-10-03.1.jsonl") });
  });

  it("has nothing to list in a missing directory", async () => {
    await expect(listLogFiles(join(dir, "nope"))).resolves.toEqual([]);
  });
});

describe("readLogTail", () => {
  beforeEach(() => {
    writeLog("gup-2026-10-01.jsonl", [record("2026-10-01T08:00:00.000Z", { event: "session.start" })]);
    writeLog("gup-2026-10-02.jsonl", [
      record("2026-10-02T09:00:00.000Z", { level: "debug", event: "cmd.end" }),
      "{ not json",
      record("2026-10-02T09:01:00.000Z", { level: "warn", event: "scan.provider", data: { error: "Please run AZ login" } }),
    ]);
    writeLog("gup-2026-10-02.1.jsonl", [record("2026-10-02T10:00:00.000Z", { level: "error", event: "session.crash" })]);
  });

  it("returns the newest records, oldest first, across files and parts", async () => {
    const tail = await readLogTail({ limit: 3 }, dir);
    expect(tail.records.map((r) => r.event)).toEqual(["cmd.end", "scan.provider", "session.crash"]);
    expect(tail.files).toHaveLength(3);
  });

  it("filters by level, date and text, counting what it could not read", async () => {
    const warnings = await readLogTail({ limit: 10, minLevel: "warn" }, dir);
    expect(warnings.records.map((r) => r.event)).toEqual(["scan.provider", "session.crash"]);
    expect(warnings.malformed).toBe(1);
    const recent = await readLogTail({ limit: 10, since: new Date("2026-10-02T09:30:00.000Z") }, dir);
    expect(recent.records.map((r) => r.event)).toEqual(["session.crash"]);
    const grep = await readLogTail({ limit: 10, grep: "az LOGIN" }, dir);
    expect(grep.records.map((r) => r.event)).toEqual(["scan.provider"]);
  });

  it("does not open files older than the requested date", async () => {
    writeFileSync(join(dir, "gup-2026-09-01.jsonl"), "garbage\n");
    const tail = await readLogTail({ limit: 50, since: new Date("2026-10-01T00:00:00.000Z") }, dir);
    expect(tail.malformed).toBe(1);
    expect(tail.records).toHaveLength(4);
  });

  it("has nothing to read without a directory", async () => {
    await expect(readLogTail({ limit: 5 }, null)).resolves.toEqual({ records: [], files: [], malformed: 0 });
    await expect(readLogTail({ limit: 5 }, join(dir, "missing"))).resolves.toEqual({
      records: [],
      files: [],
      malformed: 0,
    });
  });
});

describe("parseLogLine", () => {
  it("keeps the known fields of a well-formed record, CRLF-safe", () => {
    const line = JSON.stringify({
      ...record("2026-10-03T12:00:00.000Z"),
      ctx: { op: "update", providerId: "npm-g", packageId: "x", extra: 1 },
      data: { a: 1 },
      elevated: true,
      unknown: "dropped",
    });
    expect(parseLogLine(line)).toEqual({
      ...record("2026-10-03T12:00:00.000Z"),
      ctx: { op: "update", providerId: "npm-g", packageId: "x" },
      data: { a: 1 },
      elevated: true,
    });
  });

  it.each([
    ["not JSON", "{"],
    ["an array", "[1]"],
    ["a newer schema", JSON.stringify({ ...record("2026-10-03T12:00:00.000Z"), v: 2 })],
    ["an unknown level", JSON.stringify(record("2026-10-03T12:00:00.000Z", { level: "fatal" as never }))],
    ["a bad event name", JSON.stringify(record("2026-10-03T12:00:00.000Z", { event: "Bad Event" }))],
    ["a bad time", JSON.stringify(record("yesterday"))],
    ["a negative pid", JSON.stringify(record("2026-10-03T12:00:00.000Z", { pid: -1 }))],
    ["an oversized line", JSON.stringify(record("2026-10-03T12:00:00.000Z", { data: { x: "y".repeat(MAX_LINE_LENGTH) } }))],
  ])("refuses %s", (_case, line) => {
    expect(parseLogLine(line)).toBeNull();
  });

  it("drops a context that is not one, keeping the record", () => {
    const line = JSON.stringify({ ...record("2026-10-03T12:00:00.000Z"), ctx: { op: "delete" } });
    expect(parseLogLine(line)).toEqual(record("2026-10-03T12:00:00.000Z"));
  });
});
