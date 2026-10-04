import { describe, expect, it } from "vitest";
import type {
  RunKind,
  SchedulerState,
  ScheduleRunRecord,
  TargetResult,
  TickPlan,
} from "../../../src/core/scheduler/model/types.js";
import {
  runStatusOf,
  summarizeRun,
  unseenRuns,
} from "../../../src/core/scheduler/run-summary.js";
import { buildReport } from "../../../src/core/update/update-report.js";
import type { PlannedUpdate } from "../../../src/core/update/update-ports.js";
import { outcome, pkg } from "../../support/builders.js";
import { schedule, target } from "./scheduler-fixtures.js";

const window = {
  startedAt: new Date("2026-10-05T09:05:00Z"),
  finishedAt: new Date("2026-10-05T09:07:00Z"),
  cancelledMessage: "durée maximale d'exécution atteinte",
};

const result = (status: TargetResult["status"]): TargetResult => ({ target: "x:y", status });

describe("runStatusOf", () => {
  it.each([
    [["no-update", "no-update"], "up-to-date"],
    [["updated", "no-update"], "success"],
    [["updated", "failed"], "partial"],
    [["updated", "skipped"], "partial"],
    [["failed", "skipped"], "failed"],
    [["skipped", "no-update"], "skipped"],
  ] as const)("%j → %s", (statuses, expected) => {
    expect(runStatusOf(statuses.map(result))).toBe(expected);
  });
});

describe("summarizeRun", () => {
  const git = pkg("Git.Git", { current: "2.46.0", latest: "2.47.0" });
  const node = pkg("node", { current: "20.0.0", latest: "22.0.0" });
  const plan: TickPlan = {
    updates: [
      {
        providerId: "winget",
        pkg: git,
        targets: ["winget:git.git", "winget:Git.Git"],
        scheduleIds: ["aaaaaaaa", "bbbbbbbb"],
      },
      { providerId: "npm-g", pkg: node, targets: ["npm-g:node"], scheduleIds: ["bbbbbbbb"] },
    ],
    resolved: new Map([
      ["npm-g:typescript", { target: "npm-g:typescript", status: "no-update" }],
    ]),
    isEnvironmentDown: false,
  };
  const entry = (key: string, result: ReturnType<typeof outcome>) => ({
    key,
    providerId: key.split(":")[0]!,
    outcome: result,
  });
  const first = schedule({ id: "aaaaaaaa", targets: [target("winget", "git.git")] });
  const second = schedule({
    id: "bbbbbbbb",
    targets: [target("winget", "Git.Git"), target("npm-g", "node"), target("npm-g", "typescript")],
  });

  it("maps one install back to every schedule that listed the package", () => {
    const cancelled: PlannedUpdate = {
      providerId: "npm-g",
      packageId: "node",
      key: "npm-g:node",
      providerName: "npm",
    };
    const report = buildReport([entry("winget:Git.Git", outcome("Git.Git"))], [cancelled]);
    const records = summarizeRun(
      [
        { schedule: first, kind: "on-time" },
        { schedule: second, kind: "catch-up" },
      ],
      { plan, report, ...window },
    );
    expect(records.get("aaaaaaaa")).toEqual({
      kind: "on-time",
      status: "success",
      startedAt: "2026-10-05T09:05:00.000Z",
      finishedAt: "2026-10-05T09:07:00.000Z",
      targets: [{ target: "winget:git.git", status: "updated", from: "2.46.0", to: "2.47.0" }],
    });
    expect(records.get("bbbbbbbb")).toMatchObject({
      kind: "catch-up",
      status: "partial",
      targets: [
        { target: "winget:Git.Git", status: "updated" },
        { target: "npm-g:node", status: "skipped", message: window.cancelledMessage },
        { target: "npm-g:typescript", status: "no-update" },
      ],
    });
  });

  it("keeps the provider's message on failures and skips", () => {
    const report = buildReport(
      [
        entry("winget:Git.Git", outcome("Git.Git", { success: false, message: "1603" })),
        entry("npm-g:node", outcome("node", { success: false, skipped: true, message: "timeout" })),
      ],
      [],
    );
    const runs = [{ schedule: second, kind: "manual" as const }];
    const records = summarizeRun(runs, { plan, report, ...window });
    expect(records.get("bbbbbbbb")).toMatchObject({
      status: "failed",
      targets: [
        { target: "winget:Git.Git", status: "failed", message: "1603" },
        { target: "npm-g:node", status: "skipped", message: "timeout" },
        { target: "npm-g:typescript", status: "no-update" },
      ],
    });
  });
});

describe("unseenRuns", () => {
  const finishedAt = (iso: string, status: ScheduleRunRecord["status"], kind: RunKind) => ({
    kind,
    status,
    startedAt: iso,
    finishedAt: iso,
    targets: status === "failed" ? [result("failed")] : [result("updated")],
  });
  const schedules = ["a1b2c3d4", "0badf00d", "cafe0001", "cafe0002"].map((id) => schedule({ id }));
  const state: SchedulerState = {
    v: 1,
    schedules: {
      a1b2c3d4: { lastRun: finishedAt("2026-10-05T09:05:00.000Z", "success", "on-time") },
      "0badf00d": { lastRun: finishedAt("2026-10-05T10:05:00.000Z", "failed", "catch-up") },
      cafe0001: { lastRun: finishedAt("2026-10-05T11:00:00.000Z", "success", "manual") },
      cafe0002: { lastRun: finishedAt("2026-10-05T11:00:00.000Z", "missed", "on-time") },
      deadbeef: { lastRun: finishedAt("2026-10-05T11:00:00.000Z", "failed", "on-time") },
    },
  };

  it("counts the scheduled runs of existing schedules, never the user's own nor a missed one", () => {
    expect(unseenRuns({ schedules, state, seenUntil: null })).toEqual({ runs: 2, failures: 1 });
  });

  it("forgets what finished before the user last looked", () => {
    const seenUntil = new Date("2026-10-05T09:30:00Z");
    expect(unseenRuns({ schedules, state, seenUntil })).toEqual({ runs: 1, failures: 1 });
    const later = new Date("2026-10-05T12:00:00Z");
    expect(unseenRuns({ schedules, state, seenUntil: later })).toEqual({ runs: 0, failures: 0 });
  });
});
