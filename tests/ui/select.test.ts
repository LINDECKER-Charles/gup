import { describe, expect, it, vi } from "vitest";

const { pickMock } = vi.hoisted(() => ({ pickMock: vi.fn() }));
vi.mock("../../src/ui/prompts/package-picker.js", () => ({ pickPackages: pickMock }));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: (id: string) => (id === "winget" ? { displayName: "Winget" } : undefined),
}));

import { promptPackageSelection } from "../../src/ui/select.js";

describe("promptPackageSelection", () => {
  it("opens the picker with provider display names", async () => {
    pickMock.mockResolvedValue([]);
    const scans = [
      { providerId: "winget", available: true, packages: [{ id: "a", current: "1", latest: "2" }] },
    ];
    await promptPackageSelection(scans);
    const nameOf = pickMock.mock.calls[0]![1] as (id: string) => string;
    expect(nameOf("winget")).toBe("Winget");
    expect(nameOf("unknown")).toBe("unknown");
  });

  it("does not open anything when nothing is outdated", async () => {
    pickMock.mockClear();
    const out = await promptPackageSelection([{ providerId: "pip", available: true, packages: [] }]);
    expect(out).toEqual([]);
    expect(pickMock).not.toHaveBeenCalled();
  });
});
