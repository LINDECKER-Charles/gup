import { describe, expect, it } from "vitest";
import {
  MANUAL_STOP_MESSAGE,
  ManualRun,
  type ManualExecutor,
} from "../../../src/core/scheduler/manual-run.js";
import type { SchedulerState } from "../../../src/core/scheduler/model/types.js";
import { TargetResolver } from "../../../src/core/scheduler/target-resolver.js";
import type { UpdateRequest } from "../../../src/core/update/update-ports.js";
import { buildReport } from "../../../src/core/update/update-report.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { providerFacts, schedule, target } from "./scheduler-fixtures.js";

const NOW = new Date("2026-10-05T14:00:00Z");
const ANCHOR = "2026-10-05T09:05:00.000Z";

function setup() {
  const initial: SchedulerState = { v: 1, schedules: { a1b2c3d4: { lastAttemptAt: ANCHOR } } };
  const state = { current: initial };
  const scanned: string[][] = [];
  const manual = new ManualRun({
    clock: () => NOW,
    resolver: new TargetResolver({
      scanner: async (ids) => {
        scanned.push([...ids]);
        return { results: [scan("winget", [pkg("Git.Git")])], available: new Set(["winget"]) };
      },
      providers: providerFacts({ winget: {}, "npm-g": {} }),
    }),
    state: { update: (mutate) => (state.current = mutate(state.current)) },
  });
  return { manual, state, scanned };
}

const keyOf = (request: UpdateRequest): string => `${request.providerId}:${request.packageId}`;

const succeedAll: ManualExecutor = async (requests) => {
  const entries = requests.map((request) => ({
    key: keyOf(request),
    providerId: request.providerId,
    outcome: outcome(request.packageId),
  }));
  return buildReport(entries, []);
};

describe("ManualRun", () => {
  it("runs a schedule whatever its recurrence, keeping the due anchor", async () => {
    const { manual, state, scanned } = setup();
    const requested: UpdateRequest[] = [];
    const record = await manual.run(schedule(), async (requests) => {
      requested.push(...requests);
      return succeedAll(requests);
    });
    expect(scanned).toEqual([["winget"]]);
    expect(requested).toEqual([
      { providerId: "winget", packageId: "Git.Git", pkg: pkg("Git.Git"), scheduleId: "a1b2c3d4" },
    ]);
    expect(record).toMatchObject({ kind: "manual", status: "success" });
    expect(state.current.schedules["a1b2c3d4"]).toEqual({ lastAttemptAt: ANCHOR, lastRun: record });
  });

  it("records an up-to-date run without calling the executor", async () => {
    const { manual } = setup();
    const record = await manual.run(
      schedule({ targets: [target("winget", "Other.App")] }),
      async () => {
        throw new Error("nothing to update");
      },
    );
    expect(record).toMatchObject({ status: "up-to-date" });
  });

  it("records nothing when the user declines the run", async () => {
    const { manual, state } = setup();
    expect(await manual.run(schedule(), async () => null)).toBeNull();
    expect(state.current.schedules["a1b2c3d4"]).toEqual({ lastAttemptAt: ANCHOR });
  });

  it("marks the packages a stopped run never reached", async () => {
    const { manual } = setup();
    const record = await manual.run(schedule(), async (requests) =>
      buildReport(
        [],
        requests.map((r) => ({ ...r, key: keyOf(r), providerName: "Winget" })),
      ),
    );
    expect(record?.targets).toEqual([
      { target: "winget:Git.Git", status: "skipped", message: MANUAL_STOP_MESSAGE },
    ]);
  });

  it("plans in one step and records in another, for a launcher in between", async () => {
    const { manual, state, scanned } = setup();
    const prepared = await manual.prepare(schedule());
    expect(scanned).toEqual([["winget"]]);
    expect(prepared.plan.updates.map((update) => update.pkg.id)).toEqual(["Git.Git"]);
    expect(state.current.schedules["a1b2c3d4"]).toEqual({ lastAttemptAt: ANCHOR });
    const report = await succeedAll([{ providerId: "winget", packageId: "Git.Git" }]);
    const record = manual.settle(prepared, report);
    expect(record).toMatchObject({ kind: "manual", status: "success" });
    expect(state.current.schedules["a1b2c3d4"]?.lastRun).toEqual(record);
  });
});

describe("ManualRun with a state file that cannot be written", () => {
  it("still returns the run's record: the updates happened", async () => {
    const manual = new ManualRun({
      clock: () => NOW,
      resolver: new TargetResolver({
        scanner: async () => ({ results: [], available: new Set() }),
        providers: providerFacts({ winget: {} }),
      }),
      state: {
        update: () => {
          throw new Error("EACCES");
        },
      },
    });
    expect(await manual.run(schedule(), succeedAll)).toMatchObject({ kind: "manual" });
  });
});
