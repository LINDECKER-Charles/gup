import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLogBackend, type LogInput, type LogLevel } from "../../src/core/log/log.js";
import type { Provider, ProviderScanResult } from "../../src/core/types.js";
import { SILENT_SCAN, type ScanEvents } from "../../src/ui/panels/scan-panel.js";

const { detectMock, scanAllMock, recordScanMock } = vi.hoisted(() => ({
  detectMock: vi.fn(),
  scanAllMock: vi.fn(),
  recordScanMock: vi.fn(),
}));
vi.mock("../../src/core/registry.js", () => ({
  detectAvailableProviders: detectMock,
  scanAll: scanAllMock,
}));
vi.mock("../../src/core/history/store.js", () => ({ recordScan: recordScanMock }));

import { runScan, scanWithProgress } from "../../src/ui/scan-progress.js";

const provider = (id: string, slow = false): Provider =>
  ({ id, displayName: id.toUpperCase(), slow }) as unknown as Provider;

const RESULTS: ProviderScanResult[] = [
  { providerId: "winget", available: true, packages: [{ id: "a", current: "1", latest: "2" }] },
];

let written = "";
afterEach(() => installLogBackend(null));
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

describe("runScan records", () => {
  const FAILED: ProviderScanResult = {
    providerId: "az",
    available: true,
    packages: [],
    error: "az login required",
  };

  /** Scans winget then az, each taking a known time on a fake clock. */
  function scanTwoProviders(): void {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
    detectMock.mockResolvedValue([provider("winget"), provider("az")]);
    scanAllMock.mockImplementation(async (opts) => {
      const [winget, az] = opts.detected;
      opts.onProviderStart(winget);
      vi.advanceTimersByTime(1500);
      opts.onProviderEnd(winget, RESULTS[0]);
      opts.onProviderStart(az);
      vi.advanceTimersByTime(250);
      opts.onProviderEnd(az, FAILED);
      return [RESULTS[0], FAILED];
    });
  }

  afterEach(() => vi.useRealTimers());

  it("stores each provider's own scan time in the history", async () => {
    scanTwoProviders();

    await runScan({}, SILENT_SCAN);

    const [record] = recordScanMock.mock.calls.at(-1)!;
    expect(record.durationMs).toBe(1750);
    expect(Object.fromEntries(record.providerDurations)).toEqual({ winget: 1500, az: 250 });
  });

  it("logs the scan's start, each provider (a failure as a warning) and its end", async () => {
    const records: [LogLevel, string, LogInput | undefined][] = [];
    installLogBackend({
      isEnabled: () => true,
      emit: (level, event, data) => void records.push([level, event, data]),
    });
    scanTwoProviders();

    await runScan({ fast: true, only: ["winget", "az"] }, SILENT_SCAN);

    expect(records).toEqual([
      ["info", "scan.start", { planned: 2, fast: true, filter: ["winget", "az"] }],
      ["debug", "scan.provider", { ms: 1500, outdated: 1 }],
      ["warn", "scan.provider", { ms: 250, outdated: 0, error: "az login required" }],
      ["info", "scan.end", { ms: 1750, providers: 2, outdated: 1, errors: 1 }],
    ]);
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
