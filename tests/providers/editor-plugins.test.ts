import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runInheritMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: vi.fn(),
  runInherit: runInheritMock,
  isElevated: vi.fn(),
  whichFirst: vi.fn(),
}));

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

const { nvimConfigDirMock, nvimDataDirMock } = vi.hoisted(() => ({
  nvimConfigDirMock: vi.fn(),
  nvimDataDirMock: vi.fn(),
}));

vi.mock("../../src/core/nvim-paths.js", () => ({
  nvimConfigDir: nvimConfigDirMock,
  nvimDataDir: nvimDataDirMock,
}));

import { NvimLazyProvider } from "../../src/providers/editor-plugins/nvim-lazy.js";
import { NvimMasonProvider } from "../../src/providers/editor-plugins/nvim-mason.js";
import { NvimPackerProvider } from "../../src/providers/editor-plugins/nvim-packer.js";
import { VimPlugProvider } from "../../src/providers/editor-plugins/vim-plug.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runInheritMock.mockReset();
  existsSyncMock.mockReset();
  nvimConfigDirMock.mockReset();
  nvimDataDirMock.mockReset();
  nvimConfigDirMock.mockReturnValue("C:\\nvim-config");
  nvimDataDirMock.mockReturnValue("C:\\nvim-data");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NvimLazyProvider", () => {
  it("isAvailable returns false when nvim binary is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NvimLazyProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns true when data/lazy dir exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockImplementation((p: string) => p.endsWith("lazy"));
    await expect(new NvimLazyProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns true when only lazy-lock.json exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("lazy-lock.json"),
    );
    await expect(new NvimLazyProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when nothing exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockReturnValue(false);
    await expect(new NvimLazyProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns synthetic sync entry", async () => {
    const pkgs = await new NvimLazyProvider().listOutdated();
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]).toMatchObject({
      id: "all",
      latest: "refresh",
      note: expect.stringMatching(/Synchronise/i),
    });
  });

  it("update succeeds when nvim --headless succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NvimLazyProvider().update("all");
    expect(res).toEqual({ id: "all", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("nvim", [
      "--headless",
      "+Lazy! sync",
      "+qa",
    ]);
  });

  it("update fails when nvim --headless fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NvimLazyProvider().update("all");
    expect(res).toEqual({ id: "all", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    const res = await new NvimLazyProvider().updateAll([]);
    expect(res).toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll triggers a single sync when packages are present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NvimLazyProvider().updateAll([
      { id: "all", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "all", success: true }]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });
});

describe("NvimMasonProvider", () => {
  it("isAvailable returns false when nvim is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NvimMasonProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns true when mason dir exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockReturnValueOnce(true);
    await expect(new NvimMasonProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when mason dir is absent", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockReturnValueOnce(false);
    await expect(new NvimMasonProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns synthetic mason update entry", async () => {
    const pkgs = await new NvimMasonProvider().listOutdated();
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]).toMatchObject({ id: "all", latest: "refresh" });
    expect(pkgs[0]?.note).toMatch(/Mason/i);
  });

  it("update invokes MasonUpdate then MasonToolsUpdate", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NvimMasonProvider().update("all");
    expect(res).toEqual({ id: "all", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("nvim", [
      "--headless",
      "-c",
      "MasonUpdate",
      "-c",
      "silent! MasonToolsUpdate",
      "-c",
      "qa",
    ]);
  });

  it("update returns failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NvimMasonProvider().update("all");
    expect(res).toEqual({ id: "all", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new NvimMasonProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll invokes update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NvimMasonProvider().updateAll([
      { id: "all", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "all", success: true }]);
  });
});

describe("NvimPackerProvider", () => {
  it("isAvailable returns false when nvim is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NvimPackerProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when packer.nvim dir exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockReturnValueOnce(true);
    await expect(new NvimPackerProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when packer.nvim dir is absent", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockReturnValueOnce(false);
    await expect(new NvimPackerProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns synthetic packer sync entry", async () => {
    const pkgs = await new NvimPackerProvider().listOutdated();
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.note).toMatch(/PackerSync/);
  });

  it("update invokes PackerSync with autocmd to quit on completion", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NvimPackerProvider().update("all");
    expect(res).toEqual({ id: "all", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("nvim", [
      "--headless",
      "-c",
      "autocmd User PackerComplete quitall",
      "-c",
      "PackerSync",
    ]);
  });

  it("update reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NvimPackerProvider().update("all");
    expect(res).toEqual({ id: "all", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new NvimPackerProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll invokes update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NvimPackerProvider().updateAll([
      { id: "all", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "all", success: true }]);
  });
});

describe("VimPlugProvider", () => {
  it("isAvailable returns false when nvim is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new VimPlugProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when config-autoload/plug.vim exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockImplementation((p: string) =>
      /nvim-config[\\/]autoload[\\/]plug\.vim$/.test(p),
    );
    await expect(new VimPlugProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns true when data/site/autoload/plug.vim exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockImplementation((p: string) =>
      /site[\\/]autoload[\\/]plug\.vim$/.test(p),
    );
    await expect(new VimPlugProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns true when data/plugged exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockImplementation((p: string) => p.endsWith("plugged"));
    await expect(new VimPlugProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when no candidate path exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    existsSyncMock.mockReturnValue(false);
    await expect(new VimPlugProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns synthetic plug update entry", async () => {
    const pkgs = await new VimPlugProvider().listOutdated();
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.note).toMatch(/PlugUpdate/);
  });

  it("update invokes nvim --headless +PlugUpdate", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new VimPlugProvider().update("all");
    expect(res).toEqual({ id: "all", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("nvim", [
      "--headless",
      "+PlugUpdate --sync",
      "+qa",
    ]);
  });

  it("update fails when nvim returns non-zero", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new VimPlugProvider().update("all");
    expect(res).toEqual({ id: "all", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new VimPlugProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll invokes update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new VimPlugProvider().updateAll([
      { id: "all", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "all", success: true }]);
  });
});
