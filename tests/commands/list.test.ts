import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * listCommand has two output paths:
 *   - JSON: bypass UI, dump scanAll() directly.
 *   - Table: route through scanWithProgress (spinner) then renderScanTable.
 * Both branches must honor the `only` and `fast` options. We mock the
 * registry + ui modules to capture argv and stub their outputs.
 */
const { scanAllMock, scanWithProgressMock, renderScanTableMock, getProviderMock } = vi.hoisted(
  () => ({
    scanAllMock: vi.fn(),
    scanWithProgressMock: vi.fn(),
    renderScanTableMock: vi.fn(),
    // `--provider` ids are checked through lookupProvider(), which reads getProvider().
    getProviderMock: vi.fn(),
  }),
);

vi.mock("../../src/core/registry.js", () => ({
  scanAll: scanAllMock,
  getProvider: getProviderMock,
  ALL_PROVIDERS: [],
}));

vi.mock("../../src/ui/scan-progress.js", () => ({
  scanWithProgress: scanWithProgressMock,
}));

vi.mock("../../src/ui/table.js", () => ({
  renderScanTable: renderScanTableMock,
  renderProvidersStatus: vi.fn(),
}));

import { listCommand } from "../../src/commands/list.js";
import { PLATFORMS } from "../../src/core/platform/platforms.js";
import type { Provider } from "../../src/core/types.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

function fakeProvider(id: string, platforms?: Provider["platforms"]): Provider {
  return {
    id,
    displayName: id,
    ...(platforms && { platforms }),
    isAvailable: async () => true,
    listOutdated: async () => [],
    update: async (packageId) => ({ id: packageId, success: true }),
    updateAll: async () => [],
  };
}

const REGISTERED = new Map([
  ["npm-g", fakeProvider("npm-g")],
  ["scoop", fakeProvider("scoop")],
  ["choco", fakeProvider("choco")],
  ["brew-cask", fakeProvider("brew-cask", PLATFORMS.macos)],
]);

beforeEach(() => {
  scanAllMock.mockReset();
  scanWithProgressMock.mockReset();
  renderScanTableMock.mockReset();
  getProviderMock.mockImplementation((id: string) => REGISTERED.get(id));
  writeSpy.mockClear();
  stderrSpy.mockClear();
});

afterEach(() => restorePlatform());

const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");
const warnings = (): string => stderrSpy.mock.calls.map((call) => String(call[0])).join("");

describe("listCommand", () => {
  it("JSON mode: writes scanAll output as pretty JSON and returns 0", async () => {
    const results = [
      { providerId: "npm-g", available: true, packages: [] },
    ];
    scanAllMock.mockResolvedValueOnce(results);
    const code = await listCommand({ json: true });
    expect(code).toBe(0);
    expect(scanWithProgressMock).not.toHaveBeenCalled();
    expect(scanAllMock).toHaveBeenCalledWith({});
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0]![0]).toBe(`${JSON.stringify(results, null, 2)}\n`);
  });

  it("JSON mode: forwards only and fast options to scanAll", async () => {
    scanAllMock.mockResolvedValueOnce([]);
    await listCommand({ json: true, only: ["npm-g", "scoop"], fast: true });
    expect(scanAllMock).toHaveBeenCalledWith({ only: ["npm-g", "scoop"], fast: true });
  });

  it("JSON mode: forwards `fast: false` explicitly when provided", async () => {
    scanAllMock.mockResolvedValueOnce([]);
    await listCommand({ json: true, fast: false });
    expect(scanAllMock).toHaveBeenCalledWith({ fast: false });
  });

  it("Table mode: pipes scanWithProgress results into renderScanTable", async () => {
    const results = [
      { providerId: "npm-g", available: true, packages: [] },
    ];
    scanWithProgressMock.mockResolvedValueOnce({ results, detectedCount: 5 });
    renderScanTableMock.mockReturnValueOnce("RENDERED");

    const code = await listCommand({});
    expect(code).toBe(0);
    expect(scanAllMock).not.toHaveBeenCalled();
    expect(scanWithProgressMock).toHaveBeenCalledWith({});
    expect(renderScanTableMock).toHaveBeenCalledWith(results);
    expect(writeSpy).toHaveBeenCalledWith("RENDERED\n");
  });

  it("Table mode: forwards only/fast options to scanWithProgress", async () => {
    scanWithProgressMock.mockResolvedValueOnce({ results: [], detectedCount: 0 });
    renderScanTableMock.mockReturnValueOnce("");
    await listCommand({ only: ["choco"], fast: true });
    expect(scanWithProgressMock).toHaveBeenCalledWith({ only: ["choco"], fast: true });
  });

  it("Table mode: forwards fast=false explicitly", async () => {
    scanWithProgressMock.mockResolvedValueOnce({ results: [], detectedCount: 0 });
    renderScanTableMock.mockReturnValueOnce("");
    await listCommand({ fast: false });
    expect(scanWithProgressMock).toHaveBeenCalledWith({ fast: false });
  });
});

describe("listCommand: --provider ids gup cannot act on", () => {
  it("warns about a provider foreign to this OS, then scans as asked", async () => {
    setPlatform("win32");
    scanWithProgressMock.mockResolvedValueOnce({ results: [], detectedCount: 0 });
    renderScanTableMock.mockReturnValueOnce("");
    await listCommand({ only: ["brew-cask", "npm-g"] });
    expect(warnings().replace(ANSI, "")).toBe(
      "Attention : Provider brew-cask indisponible sur Windows (macOS uniquement) — ignoré.\n",
    );
    expect(scanWithProgressMock).toHaveBeenCalledWith({ only: ["brew-cask", "npm-g"] });
  });

  it("warns about an id no provider is registered under", async () => {
    scanAllMock.mockResolvedValueOnce([]);
    await listCommand({ json: true, only: ["nope"] });
    expect(warnings()).toContain("Provider inconnu: nope — ignoré.");
  });

  it("keeps stdout pure JSON while it warns", async () => {
    setPlatform("linux");
    scanAllMock.mockResolvedValueOnce([]);
    await listCommand({ json: true, only: ["brew-cask"] });
    expect(warnings()).toContain("indisponible sur Linux");
    expect(writeSpy.mock.calls.map((call) => String(call[0]))).toEqual(["[]\n"]);
  });

  it("says nothing about providers it can act on", async () => {
    setPlatform("darwin");
    scanAllMock.mockResolvedValueOnce([]);
    await listCommand({ json: true, only: ["brew-cask", "npm-g"] });
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
