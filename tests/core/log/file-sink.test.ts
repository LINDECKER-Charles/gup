import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_DAYS,
  FileSink,
  LOG_FILE_PATTERN,
  logFileName,
  MAX_RETENTION_DAYS,
  retentionDaysOf,
} from "../../../src/core/log/file-sink.js";

let root: string;
let dir: string;
let sink: FileSink | null = null;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gup-file-sink-"));
  dir = join(root, "logs");
});

afterEach(() => {
  sink?.close();
  sink = null;
  rmSync(root, { recursive: true, force: true });
});

/** A clock the test moves by hand. */
function clock(iso: string) {
  let now = new Date(iso);
  return { now: () => now, set: (next: string) => void (now = new Date(next)) };
}

function lines(name: string): string[] {
  return readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean);
}

describe("FileSink", () => {
  it("creates the directory and appends one line per record to the day's file", () => {
    const time = clock("2026-10-03T10:00:00Z");
    sink = new FileSink({ dir, now: time.now });
    sink.write('{"n":1}', "info");
    sink.write('{"n":2}', "debug");
    expect(lines("gup-2026-10-03.jsonl")).toEqual(['{"n":1}', '{"n":2}']);
  });

  it("starts a new file when the UTC day changes", () => {
    const time = clock("2026-10-03T23:59:59Z");
    sink = new FileSink({ dir, now: time.now });
    sink.write("a", "info");
    time.set("2026-10-04T00:00:01Z");
    sink.write("b", "info");
    expect(lines("gup-2026-10-03.jsonl")).toEqual(["a"]);
    expect(lines("gup-2026-10-04.jsonl")).toEqual(["b"]);
  });

  it("splits a day into numbered parts past the size bound, resuming the last one with room", () => {
    const time = clock("2026-10-03T10:00:00Z");
    sink = new FileSink({ dir, now: time.now, maxFileBytes: 10 });
    for (const line of ["aaaa", "bbbb", "cccc"]) sink.write(line, "info");
    sink.close();
    expect(lines("gup-2026-10-03.jsonl")).toEqual(["aaaa", "bbbb"]);
    expect(lines("gup-2026-10-03.1.jsonl")).toEqual(["cccc"]);
    sink = new FileSink({ dir, now: time.now, maxFileBytes: 10 });
    sink.write("dddd", "info");
    expect(lines("gup-2026-10-03.1.jsonl")).toEqual(["cccc", "dddd"]);
  });

  it("past the last part, writes the capped notice once and then errors only", () => {
    const time = clock("2026-10-03T10:00:00Z");
    sink = new FileSink({ dir, now: time.now, maxFileBytes: 5, maxParts: 1, cappedLine: (day) => `capped ${day}` });
    for (const line of ["1111", "2222", "3333", "4444"]) sink.write(line, "info");
    sink.write("boom", "error");
    expect(lines("gup-2026-10-03.jsonl")).toEqual(["1111"]);
    expect(lines("gup-2026-10-03.1.jsonl")).toEqual(["2222", "capped 2026-10-03", "boom"]);
    time.set("2026-10-04T00:00:00Z");
    sink.write("next day", "info");
    expect(lines("gup-2026-10-04.jsonl")).toEqual(["next day"]);
  });

  it("deletes its own files older than the retention, and nothing else", () => {
    mkdirSync(dir, { recursive: true });
    const old = ["gup-2026-09-01.jsonl", "gup-2026-09-01.3.jsonl"];
    const kept = ["gup-2026-09-20.jsonl", "notes.txt", "gup-2026-09-01.jsonl.bak"];
    for (const name of [...old, ...kept]) writeFileSync(join(dir, name), "x");
    mkdirSync(join(dir, "gup-2026-08-01.jsonl"));
    const time = clock("2026-10-03T10:00:00Z");
    sink = new FileSink({ dir, now: time.now, retentionDays: 14 });
    sink.write("today", "info");
    expect(readdirSync(dir).sort()).toEqual([...kept, "gup-2026-08-01.jsonl", "gup-2026-10-03.jsonl"].sort());
  });

  it.skipIf(process.platform === "win32")("keeps the log private to its user", () => {
    sink = new FileSink({ dir, now: clock("2026-10-03T10:00:00Z").now });
    sink.write("x", "info");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "gup-2026-10-03.jsonl")).mode & 0o777).toBe(0o600);
  });

  it("throws when the directory cannot be created, for the backend to stop", () => {
    writeFileSync(join(root, "blocker"), "a file, not a directory");
    sink = new FileSink({ dir: join(root, "blocker", "logs") });
    expect(() => sink!.write("x", "info")).toThrow();
  });
});

describe("log file names and retention setting", () => {
  it("names parts so that the reader's pattern recognises them", () => {
    expect(logFileName("2026-10-03", 0)).toBe("gup-2026-10-03.jsonl");
    expect(logFileName("2026-10-03", 9)).toBe("gup-2026-10-03.9.jsonl");
    expect(LOG_FILE_PATTERN.exec(logFileName("2026-10-03", 4))?.slice(1)).toEqual(["2026-10-03", "4"]);
  });

  it("reads GUP_LOG_RETENTION_DAYS as whole days in 1..365", () => {
    expect(retentionDaysOf(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDaysOf("30")).toBe(30);
    expect(retentionDaysOf("9999")).toBe(MAX_RETENTION_DAYS);
    expect(retentionDaysOf("0")).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDaysOf("2.5")).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDaysOf("soon")).toBe(DEFAULT_RETENTION_DAYS);
  });
});
