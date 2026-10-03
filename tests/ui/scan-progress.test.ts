import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider, ProviderScanResult } from "../../src/core/types.js";

const { detectMock, scanAllMock } = vi.hoisted(() => ({
  detectMock: vi.fn(),
  scanAllMock: vi.fn(),
}));
vi.mock("../../src/core/registry.js", () => ({
  detectAvailableProviders: detectMock,
  scanAll: scanAllMock,
}));
vi.mock("../../src/core/history/store.js", () => ({ recordScan: vi.fn() }));

import { scanWithProgress } from "../../src/ui/scan-progress.js";

const provider = (id: string, slow = false): Provider =>
  ({ id, displayName: id, slow }) as unknown as Provider;

let written = "";
beforeEach(() => {
  written = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written += String(chunk);
    return true;
  });
});

/**
 * Under vitest stdout is not a terminal, which is exactly the piped /
 * redirected case: no live band, no OpenTUI, only the summary line.
 */
describe("scanWithProgress (not a terminal)", () => {
  it("scans the planned providers and leaves one summary line", async () => {
    const results: ProviderScanResult[] = [
      { providerId: "winget", available: true, packages: [{ id: "a", current: "1", latest: "2" }] },
    ];
    detectMock.mockResolvedValue([provider("winget"), provider("pwsh-modules", true)]);
    scanAllMock.mockResolvedValue(results);

    const out = await scanWithProgress({ fast: true });

    expect(out).toEqual({ results, detectedCount: 2 });
    expect(written).toMatch(/scan terminé en [\d.]+s — 1 provider\(s\), 1 mise\(s\) à jour/);
    expect(written).not.toContain("\u001b[?");
  });

  it("says so and skips the scan when no provider is available", async () => {
    detectMock.mockResolvedValue([]);

    const out = await scanWithProgress();

    expect(out).toEqual({ results: [], detectedCount: 0 });
    expect(scanAllMock).not.toHaveBeenCalled();
    expect(written).toContain("aucun provider disponible");
  });
});
