import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HISTORY_SCHEMA_VERSION } from "../../../src/core/history/types.js";
import {
  FIXTURE_RUN_ID,
  scanEvent,
  shardFiles,
  syntheticHistory,
  toJsonl,
  updateEvent,
  writeHistoryShards,
} from "../history-fixtures.js";

describe("history records", () => {
  it("build a v1 scan whose total is the sum of its providers", () => {
    const scan = scanEvent({
      providers: [
        { providerId: "winget", outdated: 3 },
        { providerId: "pip", outdated: 0, error: "exit 1" },
      ],
    });

    expect(scan).toMatchObject({
      v: HISTORY_SCHEMA_VERSION,
      kind: "scan",
      runId: FIXTURE_RUN_ID,
      fast: false,
      filter: [],
      outdated: 3,
    });
  });

  it("build a successful update with from/to versions, any field overridable", () => {
    expect(updateEvent("npm-g", "typescript")).toMatchObject({
      kind: "update",
      providerId: "npm-g",
      packageId: "typescript",
      status: "success",
      from: "1.0.0",
      to: "2.0.0",
    });
    expect(updateEvent("npm-g", "x", { status: "failed", message: "exit 1" })).toMatchObject({
      status: "failed",
      message: "exit 1",
    });
  });

  it("serialise one record per line, newline-terminated", () => {
    const events = [scanEvent(), updateEvent("pip", "black")];

    const lines = toJsonl(events).split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
    expect(lines.slice(0, 2).map((line) => JSON.parse(line) as unknown)).toEqual(events);
  });
});

describe("history shards", () => {
  const september = updateEvent("pip", "black", { ts: "2026-09-30T23:30:00.000Z" });
  const october = updateEvent("pip", "black", { ts: "2026-10-01T00:30:00.000Z" });

  it("group records by their UTC month", () => {
    const shards = shardFiles([september, october, scanEvent({ ts: "2026-10-12T08:00:00.000Z" })]);

    expect([...shards.keys()]).toEqual(["2026-09.jsonl", "2026-10.jsonl"]);
    expect(shards.get("2026-10.jsonl")?.trimEnd().split("\n")).toHaveLength(2);
  });

  it("write the shards into the given directory", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "gup-history-")), "history");

    const files = await writeHistoryShards(dir, [september, october]);

    expect(files).toEqual([join(dir, "2026-09.jsonl"), join(dir, "2026-10.jsonl")]);
    await expect(readFile(join(dir, "2026-10.jsonl"), "utf8")).resolves.toBe(toJsonl([october]));
  });
});

describe("synthetic history", () => {
  it("produces the requested number of events in ascending time", () => {
    const events = syntheticHistory({ events: 500, spanDays: 30 });

    expect(events).toHaveLength(500);
    const times = events.map((event) => Date.parse(event.ts));
    expect(times.every((time, index) => index === 0 || time >= (times[index - 1] ?? 0))).toBe(true);
  });

  it("is the same for the same options, and changes with the seed", () => {
    expect(syntheticHistory({ events: 50 })).toEqual(syntheticHistory({ events: 50 }));
    expect(syntheticHistory({ events: 50, seed: 2 })).not.toEqual(syntheticHistory({ events: 50 }));
  });

  it("mixes one scan in ten with updates of every outcome, over the given providers", () => {
    const events = syntheticHistory({ events: 1_000, providers: ["winget", "pip"] });
    const updates = events.filter((event) => event.kind === "update");

    expect(events.filter((event) => event.kind === "scan")).toHaveLength(100);
    expect(new Set(updates.map((event) => event.status))).toEqual(
      new Set(["success", "failed", "skipped"]),
    );
    expect(new Set(updates.map((event) => event.providerId))).toEqual(new Set(["winget", "pip"]));
  });

  it("scales to the 100 000 events the insights bound is measured on", () => {
    const events = syntheticHistory({ events: 100_000 });

    expect(events).toHaveLength(100_000);
    expect(events.at(-1)?.ts.startsWith("2026-12-31")).toBe(true);
  });
});
