import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider, ProviderScanResult } from "../../src/core/types.js";
import type { ScanEvents } from "../../src/ui/panels/scan-panel.js";

const { detectMock, scanAllMock } = vi.hoisted(() => ({
  detectMock: vi.fn(),
  scanAllMock: vi.fn(),
}));
vi.mock("../../src/core/registry.js", () => ({
  detectAvailableProviders: detectMock,
  scanAll: scanAllMock,
}));
vi.mock("../../src/core/history/store.js", () => ({ recordScan: vi.fn() }));

import { runScan, scanWithProgress } from "../../src/ui/scan-progress.js";

const provider = (id: string, slow = false): Provider =>
  ({ id, displayName: id.toUpperCase(), slow }) as unknown as Provider;

const RESULTS: ProviderScanResult[] = [
  { providerId: "winget", available: true, packages: [{ id: "a", current: "1", latest: "2" }] },
];

let written = "";
beforeEach(() => {
  written = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written += String(chunk);
    return true;
  });
});

describe("runScan", () => {
  it("reports detection, the planned count and each provider as it finishes", async () => {
    detectMock.mockResolvedValue([provider("winget"), provider("pwsh-modules", true)]);
    scanAllMock.mockImplementation(async (opts) => {
      const winget = opts.detected[0];
      opts.onProviderStart(winget);
      opts.onProviderEnd(winget, RESULTS[0]);
      return RESULTS;
    });
    const calls: string[] = [];
    const events: ScanEvents = {
      detecting: () => calls.push("detecting"),
      planned: (n) => calls.push(`planned ${n}`),
      started: (name) => calls.push(`started ${name}`),
      finished: (name, outcome) => calls.push(`finished ${name} ${outcome.updates}`),
      completed: () => calls.push("completed"),
    };

    const run = await runScan({ fast: true }, events);

    expect(calls).toEqual(["detecting", "planned 1", "started WINGET", "finished WINGET 1", "completed"]);
    expect(run.results).toEqual(RESULTS);
    expect(run.detected).toHaveLength(2);
  });
});

/**
 * Under vitest stdout is not a terminal — exactly the piped / redirected
 * case: no screen, no OpenTUI, only the summary line.
 */
describe("scanWithProgress (not a terminal)", () => {
  it("scans the planned providers and leaves one summary line", async () => {
    detectMock.mockResolvedValue([provider("winget"), provider("pwsh-modules", true)]);
    scanAllMock.mockResolvedValue(RESULTS);

    const out = await scanWithProgress({ fast: true });

    expect(out).toEqual({ results: RESULTS, detectedCount: 2 });
    expect(written).toMatch(/scan terminé en [\d.]+s — 1 provider\(s\), 1 mise\(s\) à jour/);
    expect(written).not.toContain("\u001b[?");
  });

  it("says so and skips the scan when no provider is available", async () => {
    detectMock.mockResolvedValue([]);
    scanAllMock.mockClear();

    const out = await scanWithProgress();

    expect(out).toEqual({ results: [], detectedCount: 0 });
    expect(scanAllMock).not.toHaveBeenCalled();
    expect(written).toContain("aucun provider disponible");
  });
});
