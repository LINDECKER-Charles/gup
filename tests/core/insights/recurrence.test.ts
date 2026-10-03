import { describe, expect, it } from "vitest";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import { cadenceOf, MAX_VERSION_STEPS } from "../../../src/core/insights/recurrence.js";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { updateEvent } from "../../support/history-fixtures.js";

const PERIOD = parsePeriod("all", new Date("2026-12-31T00:00:00Z"))!;
const DAY_MS = 86_400_000;
const START = Date.parse("2026-01-05T09:00:00.000Z");

/** `pkg` updated through winget at each of `days` (days after START, fractions allowed). */
function updatesAt(pkg: string, days: readonly number[], status: "success" | "failed" | "skipped" = "success") {
  return days.map((day, index) =>
    updateEvent("winget", pkg, {
      ts: new Date(START + day * DAY_MS).toISOString(),
      status,
      from: `${index}.0`,
      to: `${index + 1}.0`,
    }),
  );
}

function recurrence(events: readonly HistoryEvent[]) {
  return buildInsights(events, { period: PERIOD }).recurrence;
}

describe("package recurrence", () => {
  it("measures the median interval between successful updates", () => {
    const [chrome] = recurrence(updatesAt("Google.Chrome", [0, 7, 21, 28]));

    expect(chrome).toMatchObject({
      successes: 4,
      medianIntervalDays: 7,
      cadence: "weekly",
      firstAt: "2026-01-05T09:00:00.000Z",
      lastAt: "2026-02-02T09:00:00.000Z",
      lastVersion: "4.0",
    });
  });

  it("merges a retry less than an hour after a success into that update", () => {
    const retryAfter30Min = 30 / (24 * 60);
    const [pkg] = recurrence(updatesAt("Git.Git", [0, retryAfter30Min, 30, 30 + retryAfter30Min, 60]));

    expect(pkg).toMatchObject({ successes: 5, medianIntervalDays: 30, cadence: "monthly" });
  });

  it("counts failures and skips beside the successes, which alone set the pace", () => {
    const events = [
      ...updatesAt("nodejs", [0, 50]),
      ...updatesAt("nodejs", [10, 20], "failed"),
      ...updatesAt("nodejs", [30], "skipped"),
    ];
    const [pkg] = recurrence(events);

    expect(pkg).toMatchObject({
      successes: 2,
      failures: 2,
      skips: 1,
      medianIntervalDays: 50,
      cadence: "quarterly",
    });
  });

  it("tells a package updated once from one that never succeeded", () => {
    const entries = recurrence([...updatesAt("once", [0]), ...updatesAt("never", [1], "failed")]);

    expect(entries.map(({ packageId, cadence, medianIntervalDays }) => [packageId, cadence, medianIntervalDays])).toEqual([
      ["once", "once", null],
      ["never", "none", null],
    ]);
  });

  it("lists the most updated packages first, then the most recent", () => {
    const entries = recurrence([
      ...updatesAt("rare", [0]),
      ...updatesAt("busy", [1, 8, 15]),
      ...updatesAt("recent", [40]),
    ]);

    expect(entries.map((entry) => entry.packageId)).toEqual(["busy", "recent", "rare"]);
  });

  it("keeps the latest version steps, newest first", () => {
    const days = Array.from({ length: MAX_VERSION_STEPS + 5 }, (_unused, index) => index * 2);
    const [pkg] = recurrence(updatesAt("pkg", days));

    expect(pkg!.versions).toHaveLength(MAX_VERSION_STEPS);
    expect(pkg!.versions[0]).toEqual({
      at: new Date(START + days.at(-1)! * DAY_MS).toISOString(),
      from: `${days.length - 1}.0`,
      to: `${days.length}.0`,
    });
  });

  it.each([
    [0, null, "none"],
    [1, null, "once"],
    [3, 10, "weekly"],
    [3, 10.5, "monthly"],
    [3, 45, "monthly"],
    [3, 120, "quarterly"],
    [3, 121, "rare"],
  ] as const)("calls %i successes %s days apart %s", (successes, days, cadence) => {
    expect(cadenceOf(successes, days)).toBe(cadence);
  });
});
