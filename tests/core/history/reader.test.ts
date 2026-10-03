import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readHistory } from "../../../src/core/history/reader.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import {
  scanEvent,
  toJsonl,
  updateEvent,
  writeHistoryShards,
} from "../../support/history-fixtures.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const at = (iso: string) => ({ ts: iso });

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-history-reader-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readHistory", () => {
  it("reads only the shards whose month meets the period, oldest record first", async () => {
    await writeHistoryShards(dir, [
      updateEvent("pip", "old", at("2026-05-20T10:00:00.000Z")),
      updateEvent("pip", "late-sept", at("2026-09-30T10:00:00.000Z")),
      scanEvent(at("2026-10-02T08:00:00.000Z")),
      updateEvent("pip", "early-oct", at("2026-10-01T10:00:00.000Z")),
    ]);

    const read = await readHistory(parsePeriod("7d", NOW)!, dir);

    expect(read.events.map((event) => event.ts)).toEqual([
      "2026-09-30T10:00:00.000Z",
      "2026-10-01T10:00:00.000Z",
      "2026-10-02T08:00:00.000Z",
    ]);
    expect(read.stats).toEqual({ files: 2, lines: 3, malformed: 0, unsupported: 0 });
    expect(read.dir).toBe(dir);
  });

  it("keeps the records of the period only, inside a shard too", async () => {
    await writeHistoryShards(dir, [
      updateEvent("pip", "too-old", at("2026-09-01T10:00:00.000Z")),
      updateEvent("pip", "kept", at("2026-09-30T10:00:00.000Z")),
    ]);

    const read = await readHistory(parsePeriod("2026-09-15", NOW)!, dir);

    expect(read.events.map((event) => event.kind === "update" && event.packageId)).toEqual(["kept"]);
    expect(read.stats.lines).toBe(2);
  });

  it("counts torn, foreign and newer lines without stopping, across CRLF and a BOM", async () => {
    const kept = updateEvent("pip", "rich", at("2026-10-01T10:00:00.000Z"));
    const content = [
      `﻿${JSON.stringify(kept)}`,
      "not json",
      JSON.stringify({ ...kept, v: 2 }),
      "",
      JSON.stringify(kept).slice(0, 30),
    ].join("\r\n");
    await writeFile(join(dir, "2026-10.jsonl"), content, "utf8");

    const read = await readHistory(parsePeriod("all", NOW)!, dir);

    expect(read.events).toEqual([kept]);
    expect(read.stats).toEqual({ files: 1, lines: 4, malformed: 2, unsupported: 1 });
  });

  it("ignores files and folders that are not monthly shards", async () => {
    await writeFile(join(dir, "notes.jsonl"), toJsonl([updateEvent("pip", "x")]), "utf8");
    await mkdir(join(dir, "2026-10.jsonl.d"));
    await mkdir(join(dir, "2026-09.jsonl"));

    const read = await readHistory(parsePeriod("all", NOW)!, dir);

    expect(read.stats.files).toBe(0);
    expect(read.events).toEqual([]);
  });

  it("orders records that concurrent processes appended out of order", async () => {
    const later = updateEvent("pip", "later", at("2026-10-01T10:00:05.000Z"));
    const earlier = updateEvent("choco", "earlier", at("2026-10-01T10:00:01.000Z"));
    await writeFile(join(dir, "2026-10.jsonl"), toJsonl([later, earlier]), "utf8");

    const read = await readHistory(parsePeriod("all", NOW)!, dir);

    expect(read.events).toEqual([earlier, later]);
  });

  it("reads a missing directory, or none at all, as an empty history", async () => {
    const empty = { files: 0, lines: 0, malformed: 0, unsupported: 0 };

    expect((await readHistory(parsePeriod("all", NOW)!, join(dir, "absent"))).stats).toEqual(empty);
    expect(await readHistory(parsePeriod("all", NOW)!, null)).toEqual({
      dir: null,
      events: [],
      stats: empty,
    });
  });
});
