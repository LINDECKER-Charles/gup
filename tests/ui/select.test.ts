import { describe, expect, it, vi } from "vitest";
import type { ProviderScanResult } from "../../src/core/types.js";

const { checkboxMock } = vi.hoisted(() => ({ checkboxMock: vi.fn() }));
vi.mock("../../src/ui/prompts/checkbox.js", () => ({ checkbox: checkboxMock }));
vi.mock("../../src/core/registry.js", () => ({
  ALL_PROVIDERS: [
    { id: "winget", displayName: "Winget" },
    { id: "npm-g", displayName: "npm (global)" },
  ],
}));

import { promptPackageSelection } from "../../src/ui/select.js";

describe("promptPackageSelection", () => {
  it("offers one group per provider with updates, sorted by provider id", async () => {
    const scans: ProviderScanResult[] = [
      { providerId: "winget", available: true, packages: [{ id: "Git.Git", current: "1", latest: "2" }] },
      { providerId: "pip", available: true, packages: [] },
      {
        providerId: "npm-g",
        available: true,
        packages: [{ id: "ts", name: "typescript", current: "6.0", latest: "6.1", note: "major" }],
      },
    ];
    checkboxMock.mockResolvedValue([]);

    await promptPackageSelection(scans);

    const { groups } = checkboxMock.mock.calls[0]![0];
    expect(groups.map((g: { title: string }) => g.title)).toEqual(["npm (global)", "Winget"]);
    expect(groups[0].choices[0]).toMatchObject({
      label: "typescript",
      hint: "6.0 → 6.1  [major]",
      value: { providerId: "npm-g" },
    });
  });

  it("does not prompt when nothing is outdated", async () => {
    checkboxMock.mockClear();
    const out = await promptPackageSelection([{ providerId: "pip", available: true, packages: [] }]);
    expect(out).toEqual([]);
    expect(checkboxMock).not.toHaveBeenCalled();
  });
});
