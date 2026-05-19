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

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
      "../../src/core/gh-releases.js",
    );
  return {
    ...actual,
    fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  };
});

import { CondaProvider } from "../../src/providers/python/conda.js";
import { PdmProvider } from "../../src/providers/python/pdm.js";
import { PipProvider } from "../../src/providers/python/pip.js";
import { PipxProvider } from "../../src/providers/python/pipx.js";
import { PoetryProvider } from "../../src/providers/python/poetry.js";
import { PyenvWinProvider } from "../../src/providers/python/pyenv-win.js";
import { RyeProvider } from "../../src/providers/python/rye.js";
import { UvToolsProvider } from "../../src/providers/python/uv-tools.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  whichFirstMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------- conda */
describe("CondaProvider", () => {
  it("isAvailable wires through commandExists (true)", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new CondaProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable wires through commandExists (false)", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new CondaProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe failed", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CondaProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing matches"));
    await expect(new CondaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetchGitHubReleaseLatest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("conda 24.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new CondaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest equals current", async () => {
    runMock.mockResolvedValueOnce(mkRun("conda 24.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("24.5.0");
    await expect(new CondaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("conda 24.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("24.7.0");
    const rows = await new CondaProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "conda",
        name: "Conda (base env)",
        current: "24.5.0",
        latest: "24.7.0",
        note: "updates conda + base env",
      },
    ]);
  });

  it("update runs `conda update --all -n base -y`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CondaProvider().update("conda");
    expect(res).toEqual({ id: "conda", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("conda", [
      "update",
      "--all",
      "-n",
      "base",
      "-y",
    ]);
  });

  it("update reports failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new CondaProvider().update("conda");
    expect(res).toEqual({ id: "conda", success: false });
  });

  it("updateAll returns [] on empty array", async () => {
    await expect(new CondaProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll delegates to update once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CondaProvider().updateAll([
      { id: "conda", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "conda", success: true }]);
  });
});

/* ------------------------------------------------------------------ pdm */
describe("PdmProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PdmProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PdmProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe failed", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PdmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when no version match", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version info"));
    await expect(new PdmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when PyPI !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("PDM, version 2.17.1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new PdmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("PDM, version 2.17.1"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new PdmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when info.version missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("PDM, version 2.17.1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new PdmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when versions equal", async () => {
    runMock.mockResolvedValueOnce(mkRun("PDM, version 2.17.1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "2.17.1" } }));
    await expect(new PdmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("PDM, version 2.17.1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "2.18.0" } }));
    const rows = await new PdmProvider().listOutdated();
    expect(rows).toEqual([
      { id: "pdm", name: "PDM", current: "2.17.1", latest: "2.18.0" },
    ]);
  });

  it("update runs `pdm self update`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PdmProvider().update("pdm");
    expect(res).toEqual({ id: "pdm", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("pdm", ["self", "update"]);
  });

  it("updateAll empty -> []", async () => {
    await expect(new PdmProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PdmProvider().updateAll([
      { id: "pdm", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "pdm", success: true }]);
  });
});

/* ------------------------------------------------------------------ pip */
describe("PipProvider", () => {
  it("isAvailable true when pip is on PATH", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip");
    await expect(new PipProvider().isAvailable()).resolves.toBe(true);
  });

  // Source: `return commandExists("pip") || commandExists("pip3");`
  // Both calls return Promises; the first Promise is truthy, so JS short-circuits
  // and returns its resolved value (i.e. only pip is actually probed).
  it("isAvailable resolves to whatever commandExists('pip') returns", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip3");
    await expect(new PipProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable false when neither is on PATH", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new PipProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated uses pip3 when pip missing and returns []", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip3");
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new PipProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledWith("pip3", [
      "list",
      "--outdated",
      "--user",
      "--format=json",
      "--disable-pip-version-check",
    ]);
  });

  it("listOutdated returns [] on invalid JSON", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new PipProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated maps entries", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          { name: "requests", version: "2.30.0", latest_version: "2.32.0" },
          { name: "rich", version: "13.0.0", latest_version: "13.7.1" },
        ]),
      ),
    );
    const rows = await new PipProvider().listOutdated();
    expect(rows).toEqual([
      { id: "requests", name: "requests", current: "2.30.0", latest: "2.32.0" },
      { id: "rich", name: "rich", current: "13.0.0", latest: "13.7.1" },
    ]);
  });

  it("update success", async () => {
    commandExistsMock.mockResolvedValue(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PipProvider().update("requests");
    expect(res).toEqual({ id: "requests", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pip", [
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "requests",
    ]);
  });

  it("update uses pip3 fallback and reports failure", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip3");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PipProvider().update("requests");
    expect(res).toEqual({ id: "requests", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("pip3", [
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "requests",
    ]);
  });

  it("updateAll [] short circuits", async () => {
    await expect(new PipProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll batches all ids and maps outcomes", async () => {
    commandExistsMock.mockResolvedValue(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PipProvider().updateAll([
      { id: "a", current: "1", latest: "2" } as never,
      { id: "b", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("pip", [
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "a",
      "b",
    ]);
  });

  it("updateAll falls back to pip3 when pip missing", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip3");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PipProvider().updateAll([
      { id: "a", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "a", success: false }]);
    expect(runInheritMock).toHaveBeenCalledWith("pip3", [
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "a",
    ]);
  });

  it("listOutdated falls back to pip3 binary when pip missing", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip3");
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          { name: "x", version: "1.0.0", latest_version: "2.0.0" },
        ]),
      ),
    );
    const rows = await new PipProvider().listOutdated();
    expect(rows).toEqual([{ id: "x", name: "x", current: "1.0.0", latest: "2.0.0" }]);
  });
});

/* ----------------------------------------------------------------- pipx */
describe("PipxProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PipxProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PipxProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] on empty stdout", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new PipxProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] on invalid JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new PipxProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated filters out up-to-date / null-latest venvs", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          venvs: {
            black: {
              metadata: {
                main_package: {
                  package: "black",
                  package_or_url: "black",
                  package_version: "24.0.0",
                },
              },
            },
            ruff: {
              metadata: {
                main_package: {
                  package: "ruff",
                  package_or_url: "ruff",
                  package_version: "0.5.0",
                },
              },
            },
            stayhere: {
              metadata: {
                main_package: {
                  package: "stayhere",
                  package_or_url: "stayhere",
                  package_version: "1.0.0",
                },
              },
            },
          },
        }),
      ),
    );
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("black")) return jsonResponse({ info: { version: "24.4.0" } });
      if (url.includes("ruff")) return jsonResponse({ info: { version: "0.5.0" } });
      if (url.includes("stayhere")) return jsonResponse({}, false);
      return jsonResponse({}, false);
    });
    const rows = await new PipxProvider().listOutdated();
    expect(rows).toEqual([
      { id: "black", name: "black", current: "24.0.0", latest: "24.4.0" },
    ]);
  });

  it("listOutdated swallows fetch errors", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          venvs: {
            black: {
              metadata: {
                main_package: {
                  package: "black",
                  package_or_url: "black",
                  package_version: "24.0.0",
                },
              },
            },
          },
        }),
      ),
    );
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new PipxProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops items with no info.version", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          venvs: {
            x: {
              metadata: {
                main_package: {
                  package: "x",
                  package_or_url: "x",
                  package_version: "1.0.0",
                },
              },
            },
          },
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new PipxProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `pipx upgrade <id>`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PipxProvider().update("black");
    expect(res).toEqual({ id: "black", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pipx", ["upgrade", "black"]);
  });

  it("update reports failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PipxProvider().update("black");
    expect(res).toEqual({ id: "black", success: false });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new PipxProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs upgrade-all and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PipxProvider().updateAll([
      { id: "a", current: "1", latest: "2" } as never,
      { id: "b", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "a", success: false },
      { id: "b", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("pipx", ["upgrade-all"]);
  });
});

/* --------------------------------------------------------------- poetry */
describe("PoetryProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PoetryProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PoetryProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe failed", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PoetryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when match fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version here"));
    await expect(new PoetryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when PyPI !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("Poetry (version 1.8.3)"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new PoetryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("Poetry (version 1.8.3)"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new PoetryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("Poetry (version 1.8.3)"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new PoetryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when versions equal", async () => {
    runMock.mockResolvedValueOnce(mkRun("Poetry (version 1.8.3)"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "1.8.3" } }));
    await expect(new PoetryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("Poetry (version 1.8.3)"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "1.8.4" } }));
    const rows = await new PoetryProvider().listOutdated();
    expect(rows).toEqual([
      { id: "poetry", name: "Poetry", current: "1.8.3", latest: "1.8.4" },
    ]);
  });

  it("update runs `poetry self update`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PoetryProvider().update("poetry");
    expect(res).toEqual({ id: "poetry", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("poetry", ["self", "update"]);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new PoetryProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll delegates once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PoetryProvider().updateAll([
      { id: "poetry", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "poetry", success: false }]);
  });
});

/* ------------------------------------------------------------- pyenv-win */
describe("PyenvWinProvider", () => {
  const originalPlatform = process.platform;
  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, "platform", { value: p, configurable: true });
  }
  afterEach(() => setPlatform(originalPlatform));

  it("isAvailable false on non-win32", async () => {
    setPlatform("linux");
    await expect(new PyenvWinProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("isAvailable true on win32 when commandExists true", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PyenvWinProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated [] on probe fail", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PyenvWinProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] on unparsable version", async () => {
    runMock.mockResolvedValueOnce(mkRun("bogus"));
    await expect(new PyenvWinProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("pyenv 3.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new PyenvWinProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when latest == current", async () => {
    runMock.mockResolvedValueOnce(mkRun("pyenv 3.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.1.1");
    await expect(new PyenvWinProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("pyenv 3.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.2.0");
    const rows = await new PyenvWinProvider().listOutdated();
    expect(rows).toEqual([
      { id: "pyenv-win", name: "pyenv-win", current: "3.1.1", latest: "3.2.0" },
    ]);
  });

  it("update runs `pyenv update`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PyenvWinProvider().update("pyenv-win");
    expect(res).toEqual({ id: "pyenv-win", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pyenv", ["update"]);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new PyenvWinProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PyenvWinProvider().updateAll([
      { id: "pyenv-win", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "pyenv-win", success: false }]);
  });
});

/* ------------------------------------------------------------------ rye */
describe("RyeProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new RyeProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new RyeProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated [] on probe fail", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new RyeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] unparsable", async () => {
    runMock.mockResolvedValueOnce(mkRun("???"));
    await expect(new RyeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when latest null", async () => {
    runMock.mockResolvedValueOnce(mkRun("rye 0.39.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new RyeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when equal", async () => {
    runMock.mockResolvedValueOnce(mkRun("rye 0.39.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.39.0");
    await expect(new RyeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row", async () => {
    runMock.mockResolvedValueOnce(mkRun("rye 0.39.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.40.0");
    const rows = await new RyeProvider().listOutdated();
    expect(rows).toEqual([
      { id: "rye", name: "Rye", current: "0.39.0", latest: "0.40.0" },
    ]);
  });

  it("update runs `rye self update`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new RyeProvider().update("rye");
    expect(res).toEqual({ id: "rye", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("rye", ["self", "update"]);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new RyeProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new RyeProvider().updateAll([
      { id: "rye", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "rye", success: true }]);
  });
});

/* -------------------------------------------------------------- uv-tools */
describe("UvToolsProvider", () => {
  it("isAvailable false when uv missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new UvToolsProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable false when probe fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new UvToolsProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when probe succeeds", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("ok"));
    await expect(new UvToolsProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated [] on failed list", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when no installed tool lines are parseable", async () => {
    runMock.mockResolvedValueOnce(mkRun("- foo\n\n- bar\n"));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated filters out up-to-date / nulls and returns out-of-date entries", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "ruff v0.5.0",
          "- ruff",
          "black v24.0.0",
          "- black",
          "noidea v1.0.0",
          "- noidea",
        ].join("\n"),
      ),
    );
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("ruff")) return jsonResponse({ info: { version: "0.5.0" } });
      if (url.includes("black")) return jsonResponse({ info: { version: "24.4.0" } });
      if (url.includes("noidea")) return jsonResponse({}, false);
      return jsonResponse({}, false);
    });
    const rows = await new UvToolsProvider().listOutdated();
    expect(rows).toEqual([
      { id: "black", name: "black", current: "24.0.0", latest: "24.4.0" },
    ]);
  });

  it("listOutdated swallows fetch error", async () => {
    runMock.mockResolvedValueOnce(mkRun("ruff v0.5.0\n- ruff"));
    fetchMock.mockRejectedValueOnce(new Error("nope"));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops entries when PyPI JSON omits info.version", async () => {
    runMock.mockResolvedValueOnce(mkRun("ruff v0.5.0\n- ruff"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops entries when PyPI JSON omits info entirely", async () => {
    runMock.mockResolvedValueOnce(mkRun("ruff v0.5.0\n- ruff"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `uv tool upgrade <id>`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new UvToolsProvider().update("ruff");
    expect(res).toEqual({ id: "ruff", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("uv", ["tool", "upgrade", "ruff"]);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new UvToolsProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll runs `uv tool upgrade --all` and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new UvToolsProvider().updateAll([
      { id: "ruff", current: "1", latest: "2" } as never,
      { id: "black", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "ruff", success: false },
      { id: "black", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("uv", ["tool", "upgrade", "--all"]);
  });
});
