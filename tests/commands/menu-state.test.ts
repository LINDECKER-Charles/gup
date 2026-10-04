import { describe, expect, it } from "vitest";
import { countPackages, withoutUpdated } from "../../src/commands/menu-state.js";
import type { ProviderScanResult } from "../../src/core/types.js";
import type { UpdateReport } from "../../src/core/update/update-report.js";

const pkg = (id: string) => ({ id, current: "1", latest: "2" });
const SCANS: ProviderScanResult[] = [
  { providerId: "winget", available: true, packages: [pkg("Git.Git"), pkg("7zip.7zip")] },
  { providerId: "npm-g", available: true, packages: [pkg("Git.Git")] },
];

function report(outcomes: ReadonlyArray<[string, boolean]>): UpdateReport {
  const entries = outcomes.map(([key, success]) => ({
    key,
    providerId: key.split(":")[0]!,
    outcome: { id: key.split(":")[1]!, success },
  }));
  return { entries, cancelled: [], succeeded: [], skipped: [], failed: [] };
}

describe("withoutUpdated", () => {
  it("drops what an update installed and keeps what it did not", () => {
    const outcomes: Array<[string, boolean]> = [
      ["winget:Git.Git", true],
      ["winget:7zip.7zip", false],
    ];
    const left = withoutUpdated(SCANS, report(outcomes));
    expect(left.map((scan) => [scan.providerId, scan.packages.map((p) => p.id)])).toEqual([
      ["winget", ["7zip.7zip"]],
      ["npm-g", ["Git.Git"]],
    ]);
    expect(countPackages(left)).toBe(2);
    expect(countPackages(SCANS)).toBe(3);
  });
});
