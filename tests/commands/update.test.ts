import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * updateCommand has three top-level branches plus the final summarize() pass:
 *   1. --targets <provider:id> — direct dispatch, no scan, no prompts.
 *   2. --all — full scan, optional confirm prompt, then run every package.
 *   3. interactive — full scan, checkbox selection, then run.
 *
 * Each branch is covered with mocked providers (so we can assert exact dispatch
 * and inspect outcomes) and mocked UI helpers (no real prompts/spinners).
 */

const { getProviderMock } = vi.hoisted(() => ({ getProviderMock: vi.fn() }));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: getProviderMock,
  scanAll: vi.fn(),
  ALL_PROVIDERS: [],
}));

const { scanWithProgressMock } = vi.hoisted(() => ({ scanWithProgressMock: vi.fn() }));
vi.mock("../../src/ui/scan-progress.js", () => ({
  scanWithProgress: scanWithProgressMock,
}));

const { promptPackageSelectionMock } = vi.hoisted(() => ({
  promptPackageSelectionMock: vi.fn(),
}));
vi.mock("../../src/ui/select.js", () => ({
  promptPackageSelection: promptPackageSelectionMock,
}));

const { maybeRetryFailuresMock } = vi.hoisted(() => ({
  maybeRetryFailuresMock: vi.fn(),
}));
vi.mock("../../src/ui/retry-failed.js", () => ({
  maybeRetryFailures: maybeRetryFailuresMock,
}));

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock("@inquirer/prompts", () => ({ confirm: confirmMock }));

const { runElevatedBatchMock } = vi.hoisted(() => ({
  runElevatedBatchMock: vi.fn(),
}));
vi.mock("../../src/core/elevation.js", () => ({
  runElevatedBatch: runElevatedBatchMock,
}));

import { updateCommand } from "../../src/commands/update.js";

const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

function mkProvider(over: Partial<{
  id: string;
  displayName: string;
  update: ReturnType<typeof vi.fn>;
  updateAll: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    id: over.id ?? "p",
    displayName: over.displayName ?? "Provider",
    isAvailable: vi.fn().mockResolvedValue(true),
    listOutdated: vi.fn().mockResolvedValue([]),
    update: over.update ?? vi.fn().mockResolvedValue({ id: "x", success: true }),
    updateAll:
      over.updateAll ??
      vi.fn().mockResolvedValue([{ id: "x", success: true }]),
  };
}

beforeEach(() => {
  getProviderMock.mockReset();
  scanWithProgressMock.mockReset();
  promptPackageSelectionMock.mockReset();
  maybeRetryFailuresMock.mockReset();
  confirmMock.mockReset();
  runElevatedBatchMock.mockReset();
  stdoutSpy.mockClear();
  stderrSpy.mockClear();
  // Default: pass entries through unchanged.
  maybeRetryFailuresMock.mockImplementation(async (entries: Array<{ outcome: unknown }>) =>
    entries.map((e) => e.outcome),
  );
});

describe("updateCommand: --targets", () => {
  it("returns 2 and prints stderr when a target is missing the provider:packageId separator", async () => {
    const code = await updateCommand({ targets: ["malformed"] });
    expect(code).toBe(2);
    expect(stderrSpy).toHaveBeenCalled();
    expect(stderrSpy.mock.calls[0]![0]).toMatch(/Format invalide.*malformed/);
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 2 and prints stderr when the provider is unknown", async () => {
    getProviderMock.mockReturnValueOnce(undefined);
    const code = await updateCommand({ targets: ["nope:foo"] });
    expect(code).toBe(2);
    expect(stderrSpy.mock.calls[0]![0]).toMatch(/Provider inconnu: nope/);
  });

  it("dispatches a single valid target to provider.update and reports success (exit 0)", async () => {
    const p = mkProvider({
      id: "npm-g",
      displayName: "npm -g",
      update: vi.fn().mockResolvedValue({ id: "typescript", success: true }),
    });
    getProviderMock.mockReturnValue(p);

    const code = await updateCommand({ targets: ["npm-g:typescript"] });
    expect(code).toBe(0);
    expect(p.update).toHaveBeenCalledWith("typescript");
    // Header "→ npm -g: typescript" and the OK summary line are both emitted.
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/npm -g: typescript/);
    expect(out).toMatch(/OK.*1 mise/);
  });

  it("handles multiple targets sequentially and aggregates a summary", async () => {
    const p = mkProvider({
      id: "p",
      displayName: "P",
      update: vi
        .fn()
        .mockResolvedValueOnce({ id: "a", success: true })
        .mockResolvedValueOnce({ id: "b", success: false, skipped: true, message: "do it yourself" })
        .mockResolvedValueOnce({ id: "c", success: false, message: "boom" }),
    });
    getProviderMock.mockReturnValue(p);

    const code = await updateCommand({ targets: ["p:a", "p:b", "p:c"] });
    expect(code).toBe(1); // c failed → exit 1
    expect(p.update).toHaveBeenNthCalledWith(1, "a");
    expect(p.update).toHaveBeenNthCalledWith(2, "b");
    expect(p.update).toHaveBeenNthCalledWith(3, "c");
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/OK.*1 mise/);
    expect(out).toMatch(/SKIP.*1 action.*manuelle/);
    expect(out).toMatch(/do it yourself/);
    expect(out).toMatch(/FAIL.*1\/3/);
    expect(out).toMatch(/boom/);
  });

  it("supports packageIds containing colons (only first colon is the separator)", async () => {
    const p = mkProvider({
      id: "p",
      update: vi.fn().mockResolvedValue({ id: "scope:pkg@1", success: true }),
    });
    getProviderMock.mockReturnValue(p);
    await updateCommand({ targets: ["p:scope:pkg@1"] });
    expect(p.update).toHaveBeenCalledWith("scope:pkg@1");
  });

  it("forwards yes:true to maybeRetryFailures (skip the retry prompt)", async () => {
    const p = mkProvider({
      update: vi.fn().mockResolvedValue({ id: "x", success: true }),
    });
    getProviderMock.mockReturnValue(p);
    await updateCommand({ targets: ["p:x"], yes: true });
    expect(maybeRetryFailuresMock).toHaveBeenCalledWith(expect.any(Array), { yes: true });
  });
});

describe("updateCommand: scan + interactive selection", () => {
  it("returns 0 with a 'à jour' message when scan finds no updates", async () => {
    scanWithProgressMock.mockResolvedValueOnce({ results: [], detectedCount: 0 });
    const code = await updateCommand({});
    expect(code).toBe(0);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/à jour.*aucune/);
    expect(promptPackageSelectionMock).not.toHaveBeenCalled();
  });

  it("returns 0 with 'Aucune sélection' when interactive prompt yields []", async () => {
    scanWithProgressMock.mockResolvedValueOnce({
      results: [
        {
          providerId: "p",
          available: true,
          packages: [{ id: "x", current: "1", latest: "2" }],
        },
      ],
      detectedCount: 1,
    });
    promptPackageSelectionMock.mockResolvedValueOnce([]);
    const code = await updateCommand({});
    expect(code).toBe(0);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/Aucune sélection/);
  });

  it("groups selection by provider and uses update() when one package, updateAll() otherwise", async () => {
    const pkgA1 = { id: "a1", current: "1", latest: "2" };
    const pkgA2 = { id: "a2", current: "1", latest: "2" };
    const pkgB1 = { id: "b1", current: "1", latest: "2" };

    scanWithProgressMock.mockResolvedValueOnce({
      results: [
        { providerId: "a", available: true, packages: [pkgA1, pkgA2] },
        { providerId: "b", available: true, packages: [pkgB1] },
      ],
      detectedCount: 2,
    });
    promptPackageSelectionMock.mockResolvedValueOnce([
      { providerId: "a", pkg: pkgA1 },
      { providerId: "a", pkg: pkgA2 },
      { providerId: "b", pkg: pkgB1 },
    ]);

    const provA = mkProvider({
      id: "a",
      displayName: "A",
      update: vi.fn(),
      updateAll: vi
        .fn()
        .mockResolvedValue([
          { id: "a1", success: true },
          { id: "a2", success: true },
        ]),
    });
    const provB = mkProvider({
      id: "b",
      displayName: "B",
      update: vi.fn().mockResolvedValue({ id: "b1", success: true }),
      updateAll: vi.fn(),
    });
    getProviderMock.mockImplementation((id: string) =>
      id === "a" ? provA : id === "b" ? provB : undefined,
    );

    const code = await updateCommand({});
    expect(code).toBe(0);
    expect(provA.updateAll).toHaveBeenCalledWith([pkgA1, pkgA2]);
    expect(provA.update).not.toHaveBeenCalled();
    expect(provB.update).toHaveBeenCalledWith("b1");
    expect(provB.updateAll).not.toHaveBeenCalled();
  });

  it("skips groups whose provider is no longer registered (defensive)", async () => {
    const pkg = { id: "x", current: "1", latest: "2" };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [
        { providerId: "ghost", available: true, packages: [pkg] },
      ],
      detectedCount: 1,
    });
    promptPackageSelectionMock.mockResolvedValueOnce([
      { providerId: "ghost", pkg },
    ]);
    getProviderMock.mockReturnValue(undefined);

    const code = await updateCommand({});
    // No outcomes → summarize() returns 0.
    expect(code).toBe(0);
  });
});

describe("updateCommand: --all", () => {
  it("with --yes runs every package without prompting", async () => {
    const pkg = { id: "x", current: "1", latest: "2" };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [{ providerId: "a", available: true, packages: [pkg] }],
      detectedCount: 1,
    });
    const provA = mkProvider({
      id: "a",
      update: vi.fn().mockResolvedValue({ id: "x", success: true }),
    });
    getProviderMock.mockReturnValue(provA);

    const code = await updateCommand({ all: true, yes: true });
    expect(code).toBe(0);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(provA.update).toHaveBeenCalledWith("x");
    expect(maybeRetryFailuresMock).toHaveBeenCalledWith(expect.any(Array), { yes: true });
  });

  it("without --yes asks for confirmation and proceeds when confirmed", async () => {
    const pkg = { id: "x", current: "1", latest: "2" };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [{ providerId: "a", available: true, packages: [pkg] }],
      detectedCount: 1,
    });
    const provA = mkProvider({
      id: "a",
      update: vi.fn().mockResolvedValue({ id: "x", success: true }),
    });
    getProviderMock.mockReturnValue(provA);
    confirmMock.mockResolvedValueOnce(true);

    const code = await updateCommand({ all: true });
    expect(code).toBe(0);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls[0]![0]).toMatchObject({ default: true });
    expect(confirmMock.mock.calls[0]![0]!.message).toMatch(/1 paquets/);
  });

  it("without --yes returns 1 immediately when confirmation is declined", async () => {
    scanWithProgressMock.mockResolvedValueOnce({
      results: [
        { providerId: "a", available: true, packages: [{ id: "x", current: "1", latest: "2" }] },
      ],
      detectedCount: 1,
    });
    confirmMock.mockResolvedValueOnce(false);

    const code = await updateCommand({ all: true });
    expect(code).toBe(1);
    expect(getProviderMock).not.toHaveBeenCalled();
    expect(maybeRetryFailuresMock).not.toHaveBeenCalled();
  });

  it("forwards only/fast to the underlying scan", async () => {
    scanWithProgressMock.mockResolvedValueOnce({ results: [], detectedCount: 0 });
    await updateCommand({ only: ["a"], fast: true });
    expect(scanWithProgressMock).toHaveBeenCalledWith({ only: ["a"], fast: true });
  });

  it("forwards fast=false explicitly to the underlying scan", async () => {
    scanWithProgressMock.mockResolvedValueOnce({ results: [], detectedCount: 0 });
    await updateCommand({ fast: false });
    expect(scanWithProgressMock).toHaveBeenCalledWith({ fast: false });
  });
});

describe("updateCommand: summary output", () => {
  it("reports an OK-only outcome with the green 'OK N' line and exit 0", async () => {
    const p = mkProvider({
      update: vi.fn().mockResolvedValue({ id: "x", success: true }),
    });
    getProviderMock.mockReturnValue(p);
    const code = await updateCommand({ targets: ["p:x"] });
    expect(code).toBe(0);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/OK\s+1 mise/);
    expect(out).not.toMatch(/SKIP/);
    expect(out).not.toMatch(/FAIL/);
  });

  it("reports skipped+failed lines together with appropriate prefixes", async () => {
    const p = mkProvider({
      update: vi
        .fn()
        .mockResolvedValueOnce({ id: "a", success: false, skipped: true })
        .mockResolvedValueOnce({ id: "b", success: false }),
    });
    getProviderMock.mockReturnValue(p);

    const code = await updateCommand({ targets: ["p:a", "p:b"] });
    expect(code).toBe(1);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/SKIP\s+1/);
    expect(out).toMatch(/FAIL\s+1\/2/);
  });

  it("surfaces advisory messages attached to successful outcomes (e.g. reboot required)", async () => {
    // chocoOutcome attaches a reboot advisory to the message field of a
    // SUCCESSFUL outcome (exit 3010 / 1641). The summarizer must surface it,
    // otherwise the user only sees "OK 1" and misses the reboot they need.
    const p = mkProvider({
      update: vi.fn().mockResolvedValue({
        id: "vcredist140",
        success: true,
        message: "Mise à jour effectuée — redémarrage requis pour finaliser.",
      }),
    });
    getProviderMock.mockReturnValue(p);

    await updateCommand({ targets: ["p:vcredist140"] });
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/OK\s+1 mise/);
    expect(out).toMatch(/vcredist140/);
    expect(out).toMatch(/redémarrage requis/);
  });
});

describe("updateCommand: admin batch elevation", () => {
  it("splits requiresAdmin packages out and dispatches them through runElevatedBatch", async () => {
    const adminPkg = { id: "nodejs", current: "1", latest: "2", requiresAdmin: true };
    const normalPkg = { id: "fzf", current: "1", latest: "2" };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [
        { providerId: "choco", available: true, packages: [adminPkg, normalPkg] },
      ],
      detectedCount: 1,
    });
    promptPackageSelectionMock.mockResolvedValueOnce([
      { providerId: "choco", pkg: adminPkg },
      { providerId: "choco", pkg: normalPkg },
    ]);
    const provChoco = mkProvider({
      id: "choco",
      displayName: "Chocolatey",
      update: vi.fn().mockResolvedValue({ id: "fzf", success: true }),
    });
    getProviderMock.mockReturnValue(provChoco);
    confirmMock.mockResolvedValueOnce(true); // accept elevation
    runElevatedBatchMock.mockResolvedValueOnce([{ id: "nodejs", success: true }]);

    const code = await updateCommand({});
    expect(code).toBe(0);
    // Non-admin path: normal provider.update called for fzf, NOT for nodejs.
    expect(provChoco.update).toHaveBeenCalledWith("fzf");
    expect(provChoco.update).not.toHaveBeenCalledWith("nodejs");
    // Admin path: runElevatedBatch invoked with the full provider:packageId target.
    expect(runElevatedBatchMock).toHaveBeenCalledWith(["choco:nodejs"]);
  });

  it("marks the whole admin batch as skipped when the user declines the elevation prompt", async () => {
    const adminPkg = { id: "nodejs", current: "1", latest: "2", requiresAdmin: true };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [{ providerId: "choco", available: true, packages: [adminPkg] }],
      detectedCount: 1,
    });
    promptPackageSelectionMock.mockResolvedValueOnce([
      { providerId: "choco", pkg: adminPkg },
    ]);
    getProviderMock.mockReturnValue(mkProvider({ id: "choco" }));
    confirmMock.mockResolvedValueOnce(false); // decline elevation

    const code = await updateCommand({});
    expect(runElevatedBatchMock).not.toHaveBeenCalled();
    // Skipped (not failed) → exit 0; the user made a deliberate choice.
    expect(code).toBe(0);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/SKIP/);
    expect(out).toMatch(/Élévation refusée/);
  });

  it("with --yes skips the elevation prompt and triggers the batch directly", async () => {
    const adminPkg = { id: "nodejs", current: "1", latest: "2", requiresAdmin: true };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [{ providerId: "choco", available: true, packages: [adminPkg] }],
      detectedCount: 1,
    });
    getProviderMock.mockReturnValue(mkProvider({ id: "choco" }));
    confirmMock.mockResolvedValue(true); // would say yes if asked — but should NOT be asked
    runElevatedBatchMock.mockResolvedValueOnce([{ id: "nodejs", success: true }]);

    const code = await updateCommand({ all: true, yes: true });
    expect(code).toBe(0);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(runElevatedBatchMock).toHaveBeenCalledWith(["choco:nodejs"]);
  });

  it("does not invoke runElevatedBatch when no package is marked requiresAdmin", async () => {
    const pkg = { id: "fzf", current: "1", latest: "2" };
    scanWithProgressMock.mockResolvedValueOnce({
      results: [{ providerId: "choco", available: true, packages: [pkg] }],
      detectedCount: 1,
    });
    promptPackageSelectionMock.mockResolvedValueOnce([{ providerId: "choco", pkg }]);
    const provChoco = mkProvider({
      id: "choco",
      update: vi.fn().mockResolvedValue({ id: "fzf", success: true }),
    });
    getProviderMock.mockReturnValue(provChoco);

    await updateCommand({});
    expect(runElevatedBatchMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
