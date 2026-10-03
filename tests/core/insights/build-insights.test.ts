import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import { readHistory } from "../../../src/core/history/reader.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import {
  scanEvent,
  syntheticHistory,
  updateEvent,
  writeHistoryShards,
} from "../../support/history-fixtures.js";

const NOW = new Date("2026-12-31T00:00:00Z");
const PERIOD = parsePeriod("all", NOW)!;

describe("buildInsights", () => {
  it("adds up a period's headline numbers, skips apart from failures", () => {
    const { totals } = buildInsights(
      [
        updateEvent("winget", "a", { ts: "2026-10-01T09:00:00.000Z" }),
        updateEvent("winget", "a", { ts: "2026-10-02T09:00:00.000Z", status: "failed" }),
        updateEvent("pip", "b", { ts: "2026-10-03T09:00:00.000Z" }),
        updateEvent("pip", "c", { ts: "2026-10-04T09:00:00.000Z", status: "skipped" }),
        scanEvent({ ts: "2026-10-05T09:00:00.000Z", outdated: 3 }),
      ],
      { period: PERIOD },
    );

    expect(totals).toEqual({
      attempts: 4,
      successes: 2,
      failures: 1,
      skips: 1,
      distinctPackages: 2,
      scans: 1,
      successRate: 2 / 3,
      lastUpdateAt: "2026-10-03T09:00:00.000Z",
      lastScanAt: "2026-10-05T09:00:00.000Z",
      lastOutdated: 3,
    });
  });

  it("has no success rate, last update nor scan when nothing happened", () => {
    const insights = buildInsights([], { period: PERIOD });

    expect(insights.totals).toMatchObject({ attempts: 0, successRate: null, lastUpdateAt: null, lastScanAt: null });
    expect(insights.period).toBe(PERIOD);
    expect([insights.days, insights.recurrence, insights.runs]).toEqual([[], [], []]);
  });

  it("buckets activity by the local day it gets, and by Monday-first week", () => {
    const shiftedDay = (date: Date) => new Date(date.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
    const { days, weeks } = buildInsights(
      [
        updateEvent("pip", "a", { ts: "2026-10-04T22:00:00.000Z" }),
        updateEvent("pip", "b", { ts: "2026-10-04T20:00:00.000Z", status: "failed" }),
        scanEvent({ ts: "2026-10-05T10:00:00.000Z" }),
        updateEvent("pip", "c", { ts: "2026-10-03T10:00:00.000Z", status: "skipped" }),
      ],
      { period: PERIOD, dayKey: shiftedDay },
    );

    expect(days).toEqual([
      { day: "2026-10-03", success: 0, failed: 0, skipped: 1, scans: 0 },
      { day: "2026-10-04", success: 0, failed: 1, skipped: 0, scans: 0 },
      { day: "2026-10-05", success: 1, failed: 0, skipped: 0, scans: 1 },
    ]);
    expect(weeks).toEqual([
      { weekStart: "2026-09-28", success: 0, failed: 1, skipped: 1, scans: 0 },
      { weekStart: "2026-10-05", success: 1, failed: 0, skipped: 0, scans: 1 },
    ]);
  });

  it("sums up each gup run, newest first, with what started it", () => {
    const { runs } = buildInsights(
      [
        scanEvent({ ts: "2026-10-01T09:00:00.000Z", runId: "menu-run", trigger: "menu", outdated: 5 }),
        updateEvent("pip", "a", { ts: "2026-10-01T09:05:00.000Z", runId: "menu-run", trigger: "menu" }),
        updateEvent("pip", "b", { ts: "2026-10-01T09:06:00.000Z", runId: "menu-run", status: "failed" }),
        scanEvent({ ts: "2026-10-02T03:00:00.000Z", runId: "tick", trigger: "schedule", fast: true }),
      ],
      { period: PERIOD },
    );

    expect(runs).toEqual([
      expect.objectContaining({ runId: "tick", trigger: "schedule", scans: 1, lastOutdated: null }),
      expect.objectContaining({
        runId: "menu-run",
        trigger: "menu",
        startedAt: "2026-10-01T09:00:00.000Z",
        endedAt: "2026-10-01T09:06:00.000Z",
        scans: 1,
        lastOutdated: 5,
        successes: 1,
        failures: 1,
        skips: 0,
      }),
    ]);
  });

  it("orders events it receives out of order before measuring anything", () => {
    const { recurrence } = buildInsights(
      [
        updateEvent("pip", "a", { ts: "2026-10-15T09:00:00.000Z", to: "3" }),
        updateEvent("pip", "a", { ts: "2026-10-01T09:00:00.000Z", to: "2" }),
      ],
      { period: PERIOD },
    );

    expect(recurrence[0]).toMatchObject({ firstAt: "2026-10-01T09:00:00.000Z", lastVersion: "3", medianIntervalDays: 14 });
  });

  it("reads and aggregates 100 000 events in under 1.5 s", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gup-insights-perf-"));
    try {
      await writeHistoryShards(dir, syntheticHistory({ events: 100_000, seed: 7 }));
      const everything = parsePeriod("all", new Date("2027-06-01T00:00:00Z"))!;
      const readAndAggregate = async () => {
        const startedAt = performance.now();
        const read = await readHistory(everything, dir);
        const insights = buildInsights(read.events, { period: everything });
        return { read, insights, elapsedMs: performance.now() - startedAt };
      };

      // The best of two passes: the bound is about the work, not about the
      // other suites sharing the machine (the first pass also pays the JIT).
      const first = await readAndAggregate();
      const second = await readAndAggregate();

      expect(first.read.events).toHaveLength(100_000);
      expect(first.insights.totals.attempts + first.insights.totals.scans).toBe(100_000);
      expect(Math.min(first.elapsedMs, second.elapsedMs)).toBeLessThan(1500);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
