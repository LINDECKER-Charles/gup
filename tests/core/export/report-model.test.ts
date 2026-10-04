import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import {
  buildReportModel,
  MAX_REPORT_TEXT,
  MAX_REPORT_UPDATES,
} from "../../../src/core/export/report-model.js";
import {
  NONE,
  STATUS_CODES,
  UPDATE_FLAGS,
  UPDATE_ROW,
  type ReportModel,
  type UpdateRow,
} from "../../../src/core/export/report-types.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { scanEvent, syntheticHistory, updateEvent } from "../../support/history-fixtures.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const PERIOD = parsePeriod("12m", NOW)!;
const day = (offset: number) => new Date(NOW.getTime() - offset * 86_400_000).toISOString();

function model(events: readonly HistoryEvent[], nameOf = (id: string) => id.toUpperCase()): ReportModel {
  return buildReportModel({
    events,
    insights: buildInsights(events, { period: PERIOD }),
    stats: { files: 1, lines: events.length, malformed: 2, unsupported: 0 },
    context: {
      now: NOW,
      nameOf,
      period: { label: "12 derniers mois", lead: "Sur les 12 derniers mois" },
      gup: "0.5.0",
      platform: "win32",
      timeZone: "Europe/Paris",
    },
  });
}

/** An attempt read back the way the client reads it. */
function decode(report: ReportModel, row: UpdateRow) {
  const text = (index: number) => (index === NONE ? undefined : report.strings[index]);
  const entry = report.packages[row[UPDATE_ROW.package]]!;
  return {
    at: new Date(row[UPDATE_ROW.at]).toISOString(),
    provider: report.providers[entry.provider]!.id,
    packageId: entry.id,
    status: row[UPDATE_ROW.status],
    from: text(row[UPDATE_ROW.from]),
    to: text(row[UPDATE_ROW.to]),
    durationMs: row[UPDATE_ROW.durationMs],
    message: text(row[UPDATE_ROW.message]),
    run: report.runs[row[UPDATE_ROW.run]]?.id,
    flags: row[UPDATE_ROW.flags],
    retry: text(row[UPDATE_ROW.retry]),
  };
}

describe("buildReportModel", () => {
  it("stores each attempt as a tuple that decodes back to the event, newest first", () => {
    const events = [
      scanEvent({ ts: day(5), runId: "run-a" }),
      updateEvent("winget", "Git.Git", { ts: day(5), runId: "run-a", from: "2.51.0", to: "2.52.0" }),
      updateEvent("choco", "nodejs", {
        ts: day(2),
        runId: "run-b",
        status: "failed",
        message: "exit code 1603",
        retry: "élévation",
        elevated: true,
        scheduleId: "nightly",
        durationMs: 6_100,
      }),
    ];

    const report = model(events);

    expect(report.updates.map((row) => decode(report, row))).toEqual([
      {
        at: day(2),
        provider: "choco",
        packageId: "nodejs",
        status: STATUS_CODES.failed,
        from: "1.0.0",
        to: "2.0.0",
        durationMs: 6_100,
        message: "exit code 1603",
        run: "run-b",
        flags: UPDATE_FLAGS.retry | UPDATE_FLAGS.elevated | UPDATE_FLAGS.scheduled,
        retry: "élévation",
      },
      {
        at: day(5),
        provider: "winget",
        packageId: "Git.Git",
        status: STATUS_CODES.success,
        from: "2.51.0",
        to: "2.52.0",
        durationMs: 1_000,
        message: undefined,
        run: "run-a",
        flags: 0,
        retry: undefined,
      },
    ]);
    expect(report.truncated).toBe(0);
  });

  it("keeps each distinct text once", () => {
    const events = [1, 2, 3].map((offset) =>
      updateEvent("pip", "rich", { ts: day(offset), status: "failed", message: "same failure" }),
    );

    const report = model(events);

    expect(report.strings.filter((text) => text === "same failure")).toHaveLength(1);
    expect(report.packages).toHaveLength(1);
    expect(report.providers.map((provider) => [provider.id, provider.name])).toEqual([["pip", "PIP"]]);
  });

  it("carries the insights, the period's days and how the history read went", () => {
    const report = model([
      scanEvent({ ts: day(3), outdated: 7, trigger: "menu" }),
      updateEvent("winget", "Git.Git", { ts: day(3), to: "2.52.0" }),
    ]);

    expect(report.schema).toBe(1);
    expect(report.meta).toMatchObject({
      generatedAt: NOW.toISOString(),
      gup: "0.5.0",
      timeZone: "Europe/Paris",
      locale: "fr-FR",
      period: { key: "12m", label: "12 derniers mois", lead: "Sur les 12 derniers mois", lastDay: "2026-10-03" },
      stats: { malformed: 2 },
    });
    expect(report.totals).toMatchObject({ successes: 1, scans: 1, lastOutdated: 7 });
    expect(report.days).toEqual([[day(3).slice(0, 10), 1, 0, 0, 1]]);
    expect(report.trend).toEqual([[day(3).slice(0, 10), 7]]);
    expect(report.packages[0]).toMatchObject({ id: "Git.Git", successes: 1, cadence: "once" });
    expect(report.strings[report.packages[0]!.lastVersion]).toBe("2.52.0");
    expect(report.runs[0]).toMatchObject({ trigger: "menu", scans: 1, lastOutdated: 7 });
  });

  it("masks secrets and shortens the home directory in every free text", () => {
    const home = homedir();
    const report = model([
      updateEvent("npm-g", "private-pkg", {
        ts: day(1),
        status: "failed",
        message: `npm ERR! 401 with NPM_TOKEN=npm_abcdefghijklmnopqrstuvwxyz0123456789 in ${join(home, ".npmrc")}`,
      }),
    ]);

    const message = report.strings.find((text) => text.startsWith("npm ERR!")) ?? "";
    expect(message).not.toContain("npm_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(message).not.toContain(home);
    expect(message).toContain("~");
  });

  it("bounds every text", () => {
    const report = model([updateEvent("pip", "x".repeat(5_000), { ts: day(1), message: "y".repeat(5_000) })]);

    expect(report.packages[0]!.id).toHaveLength(MAX_REPORT_TEXT);
    expect(report.packages[0]!.id.endsWith("…")).toBe(true);
    expect(Math.max(...report.strings.map((text) => text.length))).toBe(MAX_REPORT_TEXT);
  });

  it("names a package the insights do not know, with zero figures", () => {
    const events = [updateEvent("pip", "rich", { ts: day(1) })];
    const report = buildReportModel({
      events,
      insights: buildInsights([], { period: PERIOD }),
      stats: { files: 0, lines: 0, malformed: 0, unsupported: 0 },
      context: {
        now: NOW,
        nameOf: (id) => id,
        period: { label: "l", lead: "L" },
        gup: "0.5.0",
        platform: "linux",
        timeZone: "UTC",
      },
    });

    expect(report.packages).toEqual([
      expect.objectContaining({ id: "rich", successes: 0, firstAt: NONE, lastVersion: NONE, cadence: "none" }),
    ]);
    expect(report.updates[0]![UPDATE_ROW.run]).toBe(NONE);
  });

  it(`details the newest ${MAX_REPORT_UPDATES} attempts and counts the others, in under 5 MB`, () => {
    const events = syntheticHistory({ events: 56_000, seed: 3, start: new Date("2025-10-10T00:00:00Z"), spanDays: 350 });
    const updates = events.filter((event) => event.kind === "update");

    const report = model(events);

    expect(updates.length).toBeGreaterThan(MAX_REPORT_UPDATES);
    expect(report.updates).toHaveLength(MAX_REPORT_UPDATES);
    expect(report.truncated).toBe(updates.length - MAX_REPORT_UPDATES);
    expect(report.updates[0]![UPDATE_ROW.at]).toBe(Date.parse(updates.at(-1)!.ts));
    expect(report.totals.attempts).toBe(updates.length);
    expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(5 * 1024 * 1024);
  });
});
