import { describe, expect, it } from "vitest";
import type { JournalItem } from "../../../src/core/export/shared-journals.js";
import type { ClientInfo } from "../../../src/core/feedback/client-info.js";
import { buildLogBatches } from "../../../src/core/feedback/log-batches.js";

const CLIENT: ClientInfo = {
  gupVersion: "0.6.0",
  platform: "linux",
  arch: "x64",
  node: "26.10.0",
  locale: "en",
};
const START = Date.parse("2026-11-20T08:00:00.000Z");

function item(index: number, data: Record<string, unknown> = {}): JournalItem {
  const ts = new Date(START + index).toISOString();
  const record = { v: 1, ts, level: "info", event: "run.step", runId: "r", pid: 1, data };
  return { stream: "logs", ts, record } as JournalItem;
}

function parsed(body: string): { logs: { data: Record<string, unknown> }[] } {
  return JSON.parse(body);
}

describe("buildLogBatches", () => {
  it("cuts a batch before its body would pass 900 KiB", () => {
    const filler = "x".repeat(15 * 1024);
    const items = Array.from({ length: 70 }, (_, index) => item(index, { filler }));

    const batches = buildLogBatches(items, CLIENT);

    expect(batches.length).toBe(2);
    for (const batch of batches) expect(Buffer.byteLength(batch.body)).toBeLessThan(901 * 1024);
    expect(batches[0]!.counts.logs + batches[1]!.counts.logs).toBe(70);
    expect(batches[0]!.counts.logs).toBeGreaterThan(50);
  });

  it("leaves out an item over 16 KiB, and only that one", () => {
    const items = [item(0), item(1, { big: "x".repeat(17 * 1024) }), item(2)];

    const [batch] = buildLogBatches(items, CLIENT);

    expect(batch?.counts).toEqual({ history: 0, logs: 2 });
    expect(batch?.newest.logs).toEqual({ at: items[2]!.ts, count: 1 });
  });

  it("strips NUL and mends lone surrogates in values and keys", () => {
    const items = [item(0, { "ke\u0000y": "a\u0000b", lone: "x\uD800y", nested: ["\uDC00"] })];

    const [batch] = buildLogBatches(items, CLIENT);

    expect(batch?.body).not.toMatch(/\\u0000|\\ud800|\\udc00/i);
    expect(parsed(batch!.body).logs[0]?.data).toEqual({
      key: "ab",
      lone: "x�y",
      nested: ["�"],
    });
  });

  it("counts the records sharing the batch's newest instant", () => {
    const tied = { ...item(5), ts: item(5).ts };
    const batches = buildLogBatches([item(0), tied, item(5)], CLIENT);

    expect(batches[0]?.newest.logs).toEqual({ at: item(5).ts, count: 2 });
  });

  it("makes no batch out of nothing", () => {
    expect(buildLogBatches([], CLIENT)).toEqual([]);
  });
});
