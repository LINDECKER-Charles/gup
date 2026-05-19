import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock, isElevatedMock, whichFirstMock } =
  vi.hoisted(() => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: whichFirstMock,
}));

const { isCorepackShimMock } = vi.hoisted(() => ({
  isCorepackShimMock: vi.fn(),
}));

vi.mock("../../src/core/corepack-ownership.js", () => ({
  isCorepackShim: isCorepackShimMock,
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
    "../../src/core/gh-releases.js",
  );
  return {
    ...actual,
    fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  };
});

const { delegateUpdateMock } = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
}));

const { accessMock } = vi.hoisted(() => ({ accessMock: vi.fn() }));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    access: accessMock,
  };
});

import { SelfProvider } from "../../src/providers/self.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
const originalPlatform = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  whichFirstMock.mockReset();
  isCorepackShimMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  delegateUpdateMock.mockReset();
  accessMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPlatform(originalPlatform);
});

// ---------------------------------------------------------------------------
// listOutdated coverage for choco / yarn / pipx (their current()+latest()
// closures were previously never invoked by the existing test suite).
// ---------------------------------------------------------------------------

describe("SelfProvider.listOutdated extras", () => {
  it("invokes choco current() / latest() when choco is on PATH", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "choco");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "choco" ? mkRun("Chocolatey v2.2.2") : mkRun("", true),
    );
    fetchGitHubReleaseLatestMock.mockImplementation(async (repo: string) =>
      repo === "chocolatey/choco" ? "2.3.0" : null,
    );

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "choco", name: "Chocolatey", current: "2.2.2", latest: "2.3.0" },
    ]);
  });

  it("invokes yarn current() / latest() when yarn is on PATH and not corepack-owned", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "yarn");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "yarn" ? mkRun("1.22.19") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "1.22.22" }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "yarn", name: "Yarn", current: "1.22.19", latest: "1.22.22" },
    ]);
    // ensures fetchNpmLatest("yarn") was the request issued
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("registry.npmjs.org/yarn/latest"),
      expect.any(Object),
    );
  });

  it("invokes pipx current() / latest() when pipx is on PATH", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pipx");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "pipx" ? mkRun("1.4.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "1.5.0" } }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "pipx", name: "pipx", current: "1.4.0", latest: "1.5.0" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("pypi.org/pypi/pipx/json"),
      expect.any(Object),
    );
  });

  it("returns [] when fetchNpmLatest throws (network error path for npm registry)", async () => {
    // Drives the catch branch of fetchNpmLatest by rejecting the fetch.
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "npm");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "npm" ? mkRun("10.0.0") : mkRun("", true),
    );
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("returns [] when npm response is ok but has no version field (fallback to null)", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "npm");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "npm" ? mkRun("10.0.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({})); // no .version

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("returns [] when PyPI response is ok but missing info.version (fallback to null)", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pipx");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "pipx" ? mkRun("1.4.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("scoop current() falls back to raw output when 'Current Scoop version:' delimiter is absent", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "scoop");
    // No "Current Scoop version:" → split[1] is undefined → ?? out triggers,
    // parseFirstSemver still extracts the embedded version.
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "scoop" ? mkRun("Scoop 0.4.0 - built on ...") : mkRun("", true),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValue("0.5.0");

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "scoop", name: "Scoop", current: "0.4.0", latest: "0.5.0" },
    ]);
  });

  it("returns null latest when PyPI response is not ok", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pipx");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "pipx" ? mkRun("1.4.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolvePythonForPip — exercises the win32 filesystem branch (lines 167-183),
// previously skipped because whichFirstMock was always null in self.test.ts.
// ---------------------------------------------------------------------------

describe("SelfProvider.update('pip') — resolvePythonForPip filesystem branch", () => {
  it("on win32: resolves <root>/python.exe when access() succeeds", async () => {
    setPlatform("win32");
    whichFirstMock.mockResolvedValueOnce(
      "C:\\Python313\\Scripts\\pip.exe",
    );
    // First access() is for the win32 python.exe candidate.
    accessMock.mockResolvedValueOnce(undefined);
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });

    // Should have launched the resolved python.exe (NOT the fallback `py`).
    const launched = runInheritMock.mock.calls[0]![0] as string;
    expect(launched).toMatch(/python\.exe$/i);
    expect(launched.toLowerCase()).toContain("c:\\python313\\python.exe");
  });

  it("on win32: falls back to resolvePython() when python.exe is missing", async () => {
    setPlatform("win32");
    whichFirstMock.mockResolvedValueOnce(
      "C:\\BrokenPython\\Scripts\\pip.exe",
    );
    accessMock.mockRejectedValueOnce(new Error("ENOENT")); // python.exe check fails
    // resolvePython() then walks py → python → python3.
    commandExistsMock.mockImplementation(async (bin: string) => bin === "py");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });
    expect(runInheritMock).toHaveBeenCalledWith(
      "py",
      [
        "-m",
        "pip",
        "install",
        "--user",
        "-U",
        "--disable-pip-version-check",
        "pip",
      ],
    );
  });

  it("on linux: walks the POSIX candidates and prefers python3 when present", async () => {
    setPlatform("linux");
    whichFirstMock.mockResolvedValueOnce("/usr/local/bin/pip");
    accessMock.mockResolvedValueOnce(undefined); // python3 exists
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });
    const launched = runInheritMock.mock.calls[0]![0] as string;
    expect(launched.endsWith("python3")).toBe(true);
  });

  it("on linux: falls through to `python` when python3 access fails", async () => {
    setPlatform("linux");
    whichFirstMock.mockResolvedValueOnce("/usr/local/bin/pip");
    accessMock
      .mockRejectedValueOnce(new Error("ENOENT")) // python3
      .mockResolvedValueOnce(undefined); // python
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });
    const launched = runInheritMock.mock.calls[0]![0] as string;
    expect(launched.endsWith("python")).toBe(true);
    expect(launched.endsWith("python3")).toBe(false);
  });

  it("on linux: falls back to resolvePython() when both POSIX candidates are missing", async () => {
    setPlatform("linux");
    whichFirstMock.mockResolvedValueOnce("/usr/local/bin/pip");
    accessMock.mockRejectedValue(new Error("ENOENT")); // every candidate missing
    commandExistsMock.mockImplementation(async (bin: string) => bin === "python3");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });
    expect(runInheritMock.mock.calls[0]![0]).toBe("python3");
  });

  it("'python' is preferred when only python is on PATH", async () => {
    setPlatform("linux");
    whichFirstMock.mockResolvedValueOnce(null); // no pip
    commandExistsMock.mockImplementation(async (bin: string) => bin === "python");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });
    expect(runInheritMock.mock.calls[0]![0]).toBe("python");
  });
});

// ---------------------------------------------------------------------------
// Yarn npm-fallback failure propagation (covers the runInherit failed path of
// the yarn update closure when corepack isn't available).
// ---------------------------------------------------------------------------

describe("SelfProvider.update('yarn') failure propagation", () => {
  it("returns success:false when the npm-fallback fails", async () => {
    commandExistsMock.mockResolvedValue(false); // no corepack
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("yarn");
    expect(res).toEqual({ id: "yarn", success: false });
  });

  it("returns success:false when the corepack prepare fails", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "corepack");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("yarn");
    expect(res).toEqual({ id: "yarn", success: false });
  });
});

// ---------------------------------------------------------------------------
// Pipx update failure / npm update failure for symmetry.
// ---------------------------------------------------------------------------

describe("SelfProvider.update failure paths (extras)", () => {
  it("npm update reports failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("npm");
    expect(res).toEqual({ id: "npm", success: false });
  });

  it("pipx update reports failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("pipx");
    expect(res).toEqual({ id: "pipx", success: false });
  });

  it("scoop update reports failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("scoop");
    expect(res).toEqual({ id: "scoop", success: false });
  });
});
