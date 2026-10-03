import { describe, expect, it } from "vitest";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";

const PERIOD = parsePeriod("all", new Date("2026-12-31T00:00:00Z"))!;

function insights(events: readonly HistoryEvent[]) {
  return buildInsights(events, { period: PERIOD });
}

describe("provider stats", () => {
  it("counts each provider's attempts and takes the median of its update and scan times", () => {
    const { providers } = insights([
      updateEvent("winget", "a", { durationMs: 10_000 }),
      updateEvent("winget", "b", { durationMs: 30_000, status: "failed" }),
      updateEvent("winget", "c", { durationMs: 20_000, status: "skipped" }),
      updateEvent("pip", "rich", { durationMs: 1_000 }),
      scanEvent({ providers: [{ providerId: "winget", outdated: 2, durationMs: 12_000 }] }),
      scanEvent({ providers: [{ providerId: "winget", outdated: 2, durationMs: 14_000 }] }),
    ]);

    expect(providers[0]).toEqual({
      providerId: "winget",
      attempts: 3,
      successes: 1,
      failures: 1,
      skips: 1,
      medianUpdateMs: 20_000,
      medianScanMs: 13_000,
      scanErrors: 0,
    });
    expect(providers[1]).toMatchObject({ providerId: "pip", attempts: 1, medianScanMs: null });
  });

  it("lists a provider that was only scanned, with its scan errors", () => {
    const { providers } = insights([
      scanEvent({ ts: "2026-10-01T09:00:00.000Z", providers: [{ providerId: "az", outdated: 0, error: "old" }] }),
      scanEvent({ ts: "2026-10-02T09:00:00.000Z", providers: [{ providerId: "az", outdated: 0, error: "login" }] }),
    ]);

    expect(providers).toEqual([
      expect.objectContaining({ providerId: "az", attempts: 0, scanErrors: 2, lastScanError: "login" }),
    ]);
  });
});

describe("outdated trend", () => {
  it("keeps the last full scan of each day, never a fast or a filtered one", () => {
    const { trend, totals } = insights([
      scanEvent({ ts: "2026-10-01T08:00:00.000Z", outdated: 9 }),
      scanEvent({ ts: "2026-10-01T18:00:00.000Z", outdated: 7 }),
      scanEvent({ ts: "2026-10-02T08:00:00.000Z", outdated: 1, fast: true }),
      scanEvent({ ts: "2026-10-02T09:00:00.000Z", outdated: 1, filter: ["pip"] }),
      scanEvent({ ts: "2026-10-03T08:00:00.000Z", outdated: 4 }),
    ]);

    expect(trend).toEqual([
      { day: "2026-10-01", outdated: 7 },
      { day: "2026-10-03", outdated: 4 },
    ]);
    expect(totals.lastOutdated).toBe(4);
  });
});
