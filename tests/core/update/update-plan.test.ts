import { describe, expect, it } from "vitest";
import type { OutdatedPackage } from "../../../src/core/types.js";
import { planUpdates, requestsFrom } from "../../../src/core/update/update-plan.js";

const pkg = (id: string, over: Partial<OutdatedPackage> = {}): OutdatedPackage => ({
  id,
  current: "1",
  latest: "2",
  ...over,
});

const names: Record<string, string> = { winget: "Winget", npm: "npm (global)", choco: "Chocolatey" };
const nameOf = (id: string): string => names[id] ?? id;

describe("requestsFrom", () => {
  it("keeps the scan entry and adds the schedule when there is one", () => {
    const git = pkg("Git.Git");
    expect(requestsFrom([{ providerId: "winget", pkg: git }], { scheduleId: "s-1" })).toEqual([
      { providerId: "winget", packageId: "Git.Git", pkg: git, scheduleId: "s-1" },
    ]);
    expect(requestsFrom([{ providerId: "winget", pkg: git }])[0]).not.toHaveProperty("scheduleId");
  });
});

describe("planUpdates", () => {
  it("groups by provider in first-appearance order, keeping request order within", () => {
    const plan = planUpdates(
      [
        { providerId: "winget", packageId: "a" },
        { providerId: "npm", packageId: "b" },
        { providerId: "winget", packageId: "c" },
      ],
      nameOf,
    );
    expect(plan.direct.map((item) => item.key)).toEqual(["winget:a", "winget:c", "npm:b"]);
    expect(plan.direct[2]).toMatchObject({ providerName: "npm (global)", packageId: "b" });
    expect(plan.elevated).toEqual([]);
  });

  it("sends the packages that need administrator rights to the elevated batch", () => {
    const admin = pkg("nodejs", { requiresAdmin: true });
    const plan = planUpdates(
      [
        { providerId: "choco", packageId: "nodejs", pkg: admin },
        { providerId: "choco", packageId: "fzf", pkg: pkg("fzf") },
      ],
      nameOf,
    );
    expect(plan.direct.map((item) => item.key)).toEqual(["choco:fzf"]);
    expect(plan.elevated.map((item) => item.key)).toEqual(["choco:nodejs"]);
  });
});
