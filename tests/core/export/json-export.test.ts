import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JSON_EXPORT_SCHEMA, toJsonExport } from "../../../src/core/export/json-export.js";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const PERIOD = parsePeriod("30d", NOW)!;
const STATS = { files: 1, lines: 3, malformed: 1, unsupported: 0 };

function exported(events: readonly HistoryEvent[]): Record<string, unknown> {
  const json = toJsonExport({
    meta: { generatedAt: NOW, gup: "0.5.0", platform: "win32", timeZone: "UTC", period: PERIOD, stats: STATS },
    insights: buildInsights(events, { period: PERIOD }),
    events,
  });
  return JSON.parse(json) as Record<string, unknown>;
}

describe("toJsonExport", () => {
  it("describes what it was read from under a versioned schema", () => {
    const document = exported([]);

    expect(document["schema"]).toBe(JSON_EXPORT_SCHEMA);
    expect(document["meta"]).toEqual({
      generated_at: "2026-10-03T12:00:00.000Z",
      gup: "0.5.0",
      platform: "win32",
      time_zone: "UTC",
      period: { key: "30d", since: "2026-09-03T12:00:00.000Z", until: "2026-10-03T12:00:00.000Z" },
      stats: STATS,
    });
  });

  it("names every field in snake_case, events and insights alike", () => {
    const document = exported([
      updateEvent("winget", "Git.Git", { scheduleId: "s1" }),
      scanEvent({ providers: [{ providerId: "winget", outdated: 1, durationMs: 900 }] }),
    ]);

    const [update, scan] = document["events"] as Record<string, unknown>[];
    expect(Object.keys(update!)).toEqual(expect.arrayContaining(["run_id", "provider_id", "package_id", "duration_ms", "schedule_id"]));
    expect((scan!["providers"] as Record<string, unknown>[])[0]).toEqual({ provider_id: "winget", outdated: 1, duration_ms: 900 });
    const insights = document["insights"] as Record<string, unknown>;
    expect(Object.keys(insights)).toEqual(["totals", "days", "weeks", "recurrence", "providers", "trend", "failures", "runs"]);
    expect(insights["totals"]).toMatchObject({ distinct_packages: 1, success_rate: 1, last_update_at: "2026-10-01T09:00:00.000Z" });
  });

  it("redacts secrets and the home directory in events and insights", () => {
    const message = `password=hunter2 at ${join(homedir(), "app")}`;
    const json = JSON.stringify(
      exported([
        updateEvent("pip", "rich", { status: "failed", message }),
        scanEvent({ providers: [{ providerId: "az", outdated: 0, error: message }] }),
      ]),
    );

    expect(json).not.toContain("hunter2");
    expect(json).not.toContain(JSON.stringify(homedir()).slice(1, -1));
    expect(json).toContain("~");
  });
});
