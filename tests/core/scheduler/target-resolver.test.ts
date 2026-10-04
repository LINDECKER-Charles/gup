import { describe, expect, it } from "vitest";
import { requestsOf, TargetResolver } from "../../../src/core/scheduler/target-resolver.js";
import { pkg } from "../../support/builders.js";
import { providerFacts, schedule, target } from "./scheduler-fixtures.js";

describe("TargetResolver", () => {
  it("scans nothing when no target names a provider that can run unattended", async () => {
    const scanned: string[][] = [];
    const resolver = new TargetResolver({
      scanner: async (ids) => {
        scanned.push([...ids]);
        return { results: [], available: new Set() };
      },
      providers: providerFacts({ choco: { canUpdateUnattended: false } }),
    });
    const plan = await resolver.resolve([
      schedule({ targets: [target("choco", "vlc"), target("brew", "git")] }),
    ]);
    expect(scanned).toEqual([]);
    expect([...plan.resolved.values()].map((result) => result.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  });
});

describe("requestsOf", () => {
  it("asks the pipeline for the scan's row, on behalf of the first schedule", () => {
    const row = pkg("Git.Git");
    const plan = {
      updates: [
        { providerId: "winget", pkg: row, targets: ["winget:git.git"], scheduleIds: ["b", "a"] },
      ],
      resolved: new Map(),
      isEnvironmentDown: false,
    };
    expect(requestsOf(plan)).toEqual([
      { providerId: "winget", packageId: "Git.Git", pkg: row, scheduleId: "b" },
    ]);
  });
});
