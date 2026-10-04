import { describe, expect, it } from "vitest";
import type { PreparedRun } from "../../../src/core/scheduler/manual-run.js";
import { ManualRunTracker } from "../../../src/core/scheduler/manual-run-tracker.js";
import type { PlannedUpdate } from "../../../src/core/update/update-ports.js";
import type { UpdateReport } from "../../../src/core/update/update-report.js";
import { outcome, pkg } from "../../support/builders.js";
import { schedule, target } from "./scheduler-fixtures.js";

const PLANNED_AT = new Date("2026-10-05T14:00:00Z");

function prepared(): PreparedRun {
  const owner = schedule({ targets: [target("winget", "Git.Git"), target("npm-g", "pnpm")] });
  return {
    schedule: owner,
    startedAt: PLANNED_AT,
    plan: {
      updates: ["winget:Git.Git", "npm-g:pnpm"].map((key) => {
        const [providerId = "", packageId = ""] = key.split(":");
        return { providerId, pkg: pkg(packageId), targets: [key], scheduleIds: [owner.id] };
      }),
      resolved: new Map(),
      isEnvironmentDown: false,
    },
  };
}

function item(key: string, scheduleId?: string): PlannedUpdate {
  const [providerId = "", packageId = ""] = key.split(":");
  return {
    providerId,
    packageId,
    key,
    providerName: providerId,
    ...(scheduleId !== undefined && { scheduleId }),
  };
}

function tracker() {
  const settled: { prepared: PreparedRun; report: UpdateReport; endedAt: Date }[] = [];
  const clock = { now: PLANNED_AT };
  const observer = new ManualRunTracker(
    (run, report, endedAt) => void settled.push({ prepared: run, report, endedAt }),
    () => clock.now,
  );
  const keysOf = (index: number) => settled[index]?.report.entries.map((entry) => entry.key);
  return { observer, settled, keysOf, clock };
}

describe("ManualRunTracker", () => {
  it("records an armed run after each of its attempts, the latest outcome per package", () => {
    const { observer, settled, keysOf } = tracker();
    const run = prepared();
    observer.arm(run);
    observer.finished({ item: item("winget:Git.Git", run.schedule.id), outcome: outcome("Git.Git") });
    const failed = outcome("pnpm", { success: false });
    observer.finished({ item: item("npm-g:pnpm", run.schedule.id), outcome: failed });
    const retried = outcome("pnpm");
    observer.finished({ item: item("npm-g:pnpm", run.schedule.id), outcome: retried, retry: "force" });
    expect(settled.map((entry) => entry.prepared)).toEqual([run, run, run]);
    expect(keysOf(0)).toEqual(["winget:Git.Git"]);
    expect(settled[2]?.report.entries.map((entry) => entry.outcome)).toEqual([
      outcome("Git.Git"),
      retried,
    ]);
  });

  it("knows when the run's latest attempt ended, not when it is asked", () => {
    const { observer, settled, clock } = tracker();
    const run = prepared();
    observer.arm(run);
    expect(observer.endedAt(run.schedule.id)).toBeNull();
    const ended = new Date("2026-10-05T14:00:04Z");
    clock.now = ended;
    observer.finished({ item: item("winget:Git.Git", run.schedule.id), outcome: outcome("Git.Git") });
    clock.now = new Date("2026-10-05T14:10:00Z");
    expect(observer.endedAt(run.schedule.id)).toEqual(ended);
    expect(settled[0]?.endedAt).toEqual(ended);
  });

  it("records a batch stopped before any attempt", () => {
    const { observer, settled } = tracker();
    const run = prepared();
    observer.arm(run);
    observer.cancelled([item("winget:Git.Git", run.schedule.id), item("npm-g:pnpm", run.schedule.id)]);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.report.entries).toEqual([]);
  });

  it("ignores updates of no armed schedule, and a disarmed one", () => {
    const { observer, settled } = tracker();
    const run = prepared();
    observer.finished({ item: item("winget:Git.Git"), outcome: outcome("Git.Git") });
    observer.finished({ item: item("winget:Git.Git", run.schedule.id), outcome: outcome("Git.Git") });
    observer.arm(run);
    observer.disarm(run.schedule.id);
    observer.finished({ item: item("winget:Git.Git", run.schedule.id), outcome: outcome("Git.Git") });
    observer.cancelled([item("npm-g:pnpm")]);
    expect(settled).toEqual([]);
  });
});
