import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * listCommand has two output paths:
 *   - JSON: bypass UI, dump scanAll() directly.
 *   - Table: route through scanWithProgress (spinner) then renderScanTable.
 * Both branches must honor the `only` and `fast` options. We mock the
 * registry + ui modules to capture argv and stub their outputs.
 */
const { scanAllMock, scanWithProgressMock, renderScanTableMock } = vi.hoisted(() => ({
  scanAllMock: vi.fn(),
  scanWithProgressMock: vi.fn(),
  renderScanTableMock: vi.fn(),
}));

vi.mock("../../src/core/registry.js", () => ({
  scanAll: scanAllMock,
  // Real getProvider isn't reached by listCommand, but the import path needs to
  // resolve when other modules pull in registry.js transitively.
  getProvider: vi.fn(),
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

const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

beforeEach(() => {
  scanAllMock.mockReset();
  scanWithProgressMock.mockReset();
  renderScanTableMock.mockReset();
  writeSpy.mockClear();
});

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
