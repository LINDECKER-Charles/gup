import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * doctorCommand probes every provider's isAvailable() in parallel and
 * partitions the result into detected/missing for the status renderer.
 * We feed a hand-crafted ALL_PROVIDERS so the test is deterministic.
 */
const { fakeProviders, renderProvidersStatusMock } = vi.hoisted(() => {
  const fakeProviders = [
    {
      id: "winget",
      displayName: "winget",
      isAvailable: vi.fn(),
      installHint: "Microsoft Store",
      listOutdated: vi.fn(),
      update: vi.fn(),
      updateAll: vi.fn(),
    },
    {
      id: "scoop",
      displayName: "Scoop",
      isAvailable: vi.fn(),
      // no installHint → covers the falsy branch of the {installHint} spread
      listOutdated: vi.fn(),
      update: vi.fn(),
      updateAll: vi.fn(),
    },
    {
      id: "choco",
      displayName: "Chocolatey",
      isAvailable: vi.fn(),
      installHint: "https://chocolatey.org",
      listOutdated: vi.fn(),
      update: vi.fn(),
      updateAll: vi.fn(),
    },
  ];
  return { fakeProviders, renderProvidersStatusMock: vi.fn() };
});

vi.mock("../../src/core/registry.js", () => ({
  ALL_PROVIDERS: fakeProviders,
  getProvider: vi.fn(),
  scanAll: vi.fn(),
}));

vi.mock("../../src/ui/table.js", () => ({
  renderProvidersStatus: renderProvidersStatusMock,
  renderScanTable: vi.fn(),
}));

import { doctorCommand } from "../../src/commands/doctor.js";

const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

beforeEach(() => {
  for (const p of fakeProviders) p.isAvailable.mockReset();
  renderProvidersStatusMock.mockReset();
  writeSpy.mockClear();
});

describe("doctorCommand", () => {
  it("splits providers into detected/missing, drops installHint when absent, and writes the rendered output", async () => {
    fakeProviders[0]!.isAvailable.mockResolvedValueOnce(true); // winget
    fakeProviders[1]!.isAvailable.mockResolvedValueOnce(false); // scoop (no hint)
    fakeProviders[2]!.isAvailable.mockResolvedValueOnce(false); // choco
    renderProvidersStatusMock.mockReturnValueOnce("OUT");

    const code = await doctorCommand();
    expect(code).toBe(0);

    expect(renderProvidersStatusMock).toHaveBeenCalledTimes(1);
    const [detected, missing] = renderProvidersStatusMock.mock.calls[0]!;
    expect(detected).toEqual(["winget"]);
    expect(missing).toEqual([
      { id: "scoop", displayName: "Scoop" },
      { id: "choco", displayName: "Chocolatey", installHint: "https://chocolatey.org" },
    ]);
    expect(writeSpy).toHaveBeenCalledWith("OUT\n");
  });

  it("all-detected: missing array is empty", async () => {
    for (const p of fakeProviders) p.isAvailable.mockResolvedValueOnce(true);
    renderProvidersStatusMock.mockReturnValueOnce("ALL");
    await doctorCommand();
    const [detected, missing] = renderProvidersStatusMock.mock.calls[0]!;
    expect(detected).toEqual(["winget", "scoop", "choco"]);
    expect(missing).toEqual([]);
  });

  it("none-detected: detected array is empty", async () => {
    for (const p of fakeProviders) p.isAvailable.mockResolvedValueOnce(false);
    renderProvidersStatusMock.mockReturnValueOnce("");
    await doctorCommand();
    const [detected, missing] = renderProvidersStatusMock.mock.calls[0]!;
    expect(detected).toEqual([]);
    expect(missing.map((m: { id: string }) => m.id)).toEqual(["winget", "scoop", "choco"]);
  });
});
