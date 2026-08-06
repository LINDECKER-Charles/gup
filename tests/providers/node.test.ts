import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  commandExistsMock,
  runMock,
  runInheritMock,
  isElevatedMock,
  whichFirstMock,
} = vi.hoisted(() => ({
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

const {
  delegateUpdateMock,
  detectInstallSourceMock,
  describeSourceMock,
  runPmUpdateMock,
} = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
  detectInstallSourceMock: vi.fn(),
  describeSourceMock: vi.fn(),
  runPmUpdateMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
  runPmUpdate: runPmUpdateMock,
}));

const { fetchGitHubReleaseLatestMock, normalizeVersionMock } = vi.hoisted(
  () => ({
    fetchGitHubReleaseLatestMock: vi.fn(),
    normalizeVersionMock: vi.fn(),
  }),
);

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/core/gh-releases.js")
  >("../../src/core/gh-releases.js");
  return {
    ...actual,
    fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
    normalizeVersion: normalizeVersionMock,
  };
});

const { isCorepackShimMock } = vi.hoisted(() => ({
  isCorepackShimMock: vi.fn(),
}));

vi.mock("../../src/core/corepack-ownership.js", () => ({
  isCorepackShim: isCorepackShimMock,
}));

import { BunGlobalProvider } from "../../src/providers/node/bun-global.js";
import { CorepackProvider } from "../../src/providers/node/corepack.js";
import { DenoProvider } from "../../src/providers/node/deno.js";
import { FnmProvider } from "../../src/providers/node/fnm.js";
import { NpmGlobalProvider } from "../../src/providers/node/npm-global.js";
import { NvmWindowsProvider } from "../../src/providers/node/nvm-windows.js";
import { PnpmGlobalProvider } from "../../src/providers/node/pnpm-global.js";
import { VoltaProvider } from "../../src/providers/node/volta.js";
import { YarnGlobalProvider } from "../../src/providers/node/yarn-global.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
const originalPlatform = process.platform;

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  whichFirstMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  normalizeVersionMock.mockReset();
  isCorepackShimMock.mockReset();

  // Sensible defaults.
  describeSourceMock.mockImplementation((src: string) =>
    src === "manual" ? "manuel" : `via ${src}`,
  );
  normalizeVersionMock.mockImplementation((v: string) =>
    v.trim().replace(/^v/i, "").toLowerCase(),
  );

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPlatform(originalPlatform);
});

// ----------------------------------------------------------------------------
// BunGlobalProvider
// ----------------------------------------------------------------------------
describe("BunGlobalProvider", () => {
  it("isAvailable returns commandExists('bun')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new BunGlobalProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("bun");

    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new BunGlobalProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when bun pm ls fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when no packages parse", async () => {
    runMock.mockResolvedValueOnce(mkRun("/home/user/.bun/install/global\n"));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated filters out unchanged and null-latest packages", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "/home/user/.bun/install/global",
          "  typescript@5.0.0",
          "  prettier@3.0.0",
          "  @scope/pkg@1.0.0",
        ].join("\n"),
      ),
    );
    // typescript -> 5.1.0 (outdated), prettier -> same, @scope/pkg -> fetch !ok
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("typescript")) return jsonResponse({ version: "5.1.0" });
      if (url.includes("prettier")) return jsonResponse({ version: "3.0.0" });
      return jsonResponse({}, false);
    });

    const rows = await new BunGlobalProvider().listOutdated();
    expect(rows).toEqual([
      { id: "typescript", name: "typescript", current: "5.0.0", latest: "5.1.0" },
    ]);
  });

  it("parses the real tree-prefixed layout `bun pm ls -g` actually prints", async () => {
    // Regression guard. Every other fixture in this file feeds two-space
    // indented lines, but bun prints a box-drawing tree. The prefix
    // alternation in the provider had been corrupted into double-encoded
    // UTF-8 (`â”œâ”€â”€` instead of `├──`), so it could never match real output
    // and every tree-prefixed package was silently dropped from the scan —
    // a bug no fixture here could reveal.
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "/home/user/.bun/install/global node_modules (3)",
          "├── typescript@5.0.0",
          "└── @scope/pkg@1.0.0",
        ].join("\n"),
      ),
    );
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse({ version: url.includes("typescript") ? "5.1.0" : "2.0.0" }),
    );

    const rows = await new BunGlobalProvider().listOutdated();
    expect(rows).toEqual([
      { id: "typescript", name: "typescript", current: "5.0.0", latest: "5.1.0" },
      { id: "@scope/pkg", name: "@scope/pkg", current: "1.0.0", latest: "2.0.0" },
    ]);
  });

  it("listOutdated swallows fetch errors", async () => {
    runMock.mockResolvedValueOnce(mkRun("  typescript@5.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips packages where the registry has no version field", async () => {
    runMock.mockResolvedValueOnce(mkRun("  typescript@5.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `bun add -g <pkg>@latest`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new BunGlobalProvider().update("typescript")).resolves.toEqual({
      id: "typescript",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("bun", [
      "add",
      "-g",
      "typescript@latest",
    ]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new BunGlobalProvider().update("ts")).resolves.toEqual({
      id: "ts",
      success: false,
    });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new BunGlobalProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs `bun update -g` and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new BunGlobalProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: false },
      { id: "b", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("bun", ["update", "-g"]);
  });
});

// ----------------------------------------------------------------------------
// CorepackProvider
// ----------------------------------------------------------------------------
describe("CorepackProvider", () => {
  it("isAvailable returns commandExists('corepack')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new CorepackProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("corepack");
  });

  it("listOutdated returns [] when no managed binaries are present", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated skips a binary that exists but is NOT a corepack shim", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pnpm");
    isCorepackShimMock.mockResolvedValue(false);
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("listOutdated skips a binary when `--version` fails", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pnpm");
    isCorepackShimMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips a binary when version doesn't start with a digit", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pnpm");
    isCorepackShimMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("notaversion"));
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when corepack-owned pnpm is outdated", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pnpm");
    isCorepackShimMock.mockImplementation(async (b: string) => b === "pnpm");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "pnpm" ? mkRun("9.0.0\n") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "9.5.0" }));

    const rows = await new CorepackProvider().listOutdated();
    expect(rows).toEqual([
      { id: "pnpm", name: "pnpm", current: "9.0.0", latest: "9.5.0" },
    ]);
  });

  it("listOutdated returns [] when latest equals current", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "yarn");
    isCorepackShimMock.mockResolvedValue(true);
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "yarn" ? mkRun("4.0.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "4.0.0" }));
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when registry fetch is !ok", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pnpm");
    isCorepackShimMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("9.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pnpm");
    isCorepackShimMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("9.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs corepack prepare <pkg>@latest --activate", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new CorepackProvider().update("yarn")).resolves.toEqual({
      id: "yarn",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("corepack", [
      "prepare",
      "yarn@latest",
      "--activate",
    ]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CorepackProvider().update("pnpm")).resolves.toEqual({
      id: "pnpm",
      success: false,
    });
  });

  it("updateAll iterates sequentially", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new CorepackProvider().updateAll([
      { id: "pnpm", current: "1", latest: "2" },
      { id: "yarn", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "pnpm", success: true },
      { id: "yarn", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(2);
  });

  it("updateAll empty -> []", async () => {
    await expect(new CorepackProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// DenoProvider
// ----------------------------------------------------------------------------
describe("DenoProvider", () => {
  it("isAvailable returns commandExists('deno')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new DenoProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("deno");
  });

  it("listOutdated returns [] when deno --version fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new DenoProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version line cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("not deno output"));
    await expect(new DenoProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when GitHub fetch is !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("deno 1.46.3 (release, x86_64-pc-windows-msvc)"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new DenoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when tag_name is missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("deno 1.46.3"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new DenoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("deno 1.46.3"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new DenoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("deno 1.46.3"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v1.46.3" }));
    await expect(new DenoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("deno 1.46.3"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v1.47.0" }));
    const rows = await new DenoProvider().listOutdated();
    expect(rows).toEqual([
      { id: "deno", name: "Deno", current: "1.46.3", latest: "1.47.0" },
    ]);
  });

  it("update runs `deno upgrade`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new DenoProvider().update("deno")).resolves.toEqual({
      id: "deno",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("deno", ["upgrade"]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new DenoProvider().update("deno")).resolves.toEqual({
      id: "deno",
      success: false,
    });
  });

  it("updateAll [] -> []", async () => {
    await expect(new DenoProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs once and returns one outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new DenoProvider().updateAll([
      { id: "deno", current: "1.46.3", latest: "1.47.0" },
    ]);
    expect(res).toEqual([{ id: "deno", success: true }]);
  });
});

// ----------------------------------------------------------------------------
// FnmProvider
// ----------------------------------------------------------------------------
describe("FnmProvider", () => {
  it("isAvailable returns commandExists('fnm')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new FnmProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new FnmProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when --version fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new FnmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version here"));
    await expect(new FnmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("fnm 1.37.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new FnmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("fnm 1.37.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.37.0");
    await expect(new FnmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a single row with source note", async () => {
    runMock.mockResolvedValueOnce(mkRun("fnm v1.37.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.38.0");
    detectInstallSourceMock.mockResolvedValueOnce("winget");

    const rows = await new FnmProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "fnm",
        name: "fnm",
        current: "1.37.0",
        latest: "1.38.0",
        note: "via winget",
      },
    ]);
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("fnm 1.37.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.38.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");

    const rows = await new FnmProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("update delegates with the correct package ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "fnm", success: true });
    await new FnmProvider().update("fnm");
    const call = delegateUpdateMock.mock.calls[0]![0];
    expect(call).toMatchObject({
      id: "fnm",
      binary: "fnm",
      packageIds: { scoop: "fnm", choco: "fnm", winget: "Schniz.fnm" },
    });
    expect(call.manualMessage).toContain("github.com/Schniz/fnm");
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new FnmProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll returns a single outcome", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "fnm", success: true });
    const res = await new FnmProvider().updateAll([
      { id: "fnm", current: "1.37.0", latest: "1.38.0" },
    ]);
    expect(res).toEqual([{ id: "fnm", success: true }]);
  });
});

// ----------------------------------------------------------------------------
// NpmGlobalProvider
// ----------------------------------------------------------------------------
describe("NpmGlobalProvider", () => {
  it("isAvailable returns commandExists('npm')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new NpmGlobalProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("npm");
  });

  it("listOutdated returns [] when stdout is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("   "));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when stdout is not JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when JSON is empty object", async () => {
    runMock.mockResolvedValueOnce(mkRun("{}"));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated filters entries lacking current/latest or where they are equal", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          "pkg-equal": { current: "1.0.0", wanted: "1.0.0", latest: "1.0.0" },
          "pkg-no-current": { latest: "1.0.0" },
          "pkg-no-latest": { current: "1.0.0" },
          "pkg-ok": { current: "1.0.0", wanted: "2.0.0", latest: "2.0.0" },
        }),
      ),
    );

    const rows = await new NpmGlobalProvider().listOutdated();
    expect(rows).toEqual([
      { id: "pkg-ok", name: "pkg-ok", current: "1.0.0", latest: "2.0.0" },
    ]);
  });

  it("update runs npm install -g <pkg>@latest", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new NpmGlobalProvider().update("typescript")).resolves.toEqual({
      id: "typescript",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("npm", [
      "install",
      "-g",
      "typescript@latest",
    ]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NpmGlobalProvider().update("ts")).resolves.toEqual({
      id: "ts",
      success: false,
    });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new NpmGlobalProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll bulk-installs and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NpmGlobalProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("npm", [
      "install",
      "-g",
      "a@latest",
      "b@latest",
    ]);
  });
});

// ----------------------------------------------------------------------------
// NvmWindowsProvider
// ----------------------------------------------------------------------------
describe("NvmWindowsProvider", () => {
  it("isAvailable returns false off-Windows", async () => {
    setPlatform("linux");
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns false when binary missing", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when `nvm version` fails", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when banner doesn't match the version regex", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("nvm.sh help text"));
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when banner is a vX.Y line", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("1.1.12"));
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NvmWindowsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version unparsable", async () => {
    runMock.mockResolvedValueOnce(mkRun("no digits"));
    await expect(new NvmWindowsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.12"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new NvmWindowsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.12"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.1.12");
    await expect(new NvmWindowsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row with note when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.12"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockResolvedValueOnce("choco");
    const rows = await new NvmWindowsProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "nvm-windows",
        name: "nvm-windows",
        current: "1.1.12",
        latest: "1.2.0",
        note: "via choco",
      },
    ]);
  });

  it("listOutdated flags manual", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.12"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    const rows = await new NvmWindowsProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("update delegates with the correct package ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "nvm-windows", success: true });
    await new NvmWindowsProvider().update("nvm-windows");
    const call = delegateUpdateMock.mock.calls[0]![0];
    expect(call).toMatchObject({
      id: "nvm-windows",
      binary: "nvm",
      packageIds: {
        scoop: "nvm",
        choco: "nvm",
        winget: "CoreyButler.NVMforWindows",
      },
    });
    expect(call.manualMessage).toContain("coreybutler/nvm-windows");
  });

  it("updateAll [] -> []", async () => {
    await expect(new NvmWindowsProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll returns one outcome", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "nvm-windows", success: false });
    const res = await new NvmWindowsProvider().updateAll([
      { id: "nvm-windows", current: "1.1.12", latest: "1.2.0" },
    ]);
    expect(res).toEqual([{ id: "nvm-windows", success: false }]);
  });
});

// ----------------------------------------------------------------------------
// PnpmGlobalProvider
// ----------------------------------------------------------------------------
describe("PnpmGlobalProvider", () => {
  it("isAvailable returns commandExists('pnpm')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PnpmGlobalProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("pnpm");
  });

  it("listOutdated returns [] when stdout is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("   "));
    await expect(new PnpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when stdout is not JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new PnpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when JSON is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("{}"));
    await expect(new PnpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated filters and surfaces deprecated note", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          "equal-pkg": { current: "1.0.0", wanted: "1.0.0", latest: "1.0.0" },
          "outdated-pkg": {
            current: "1.0.0",
            wanted: "2.0.0",
            latest: "2.0.0",
          },
          "deprecated-pkg": {
            current: "1.0.0",
            wanted: "2.0.0",
            latest: "2.0.0",
            isDeprecated: true,
          },
        }),
      ),
    );

    const rows = await new PnpmGlobalProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "outdated-pkg",
        name: "outdated-pkg",
        current: "1.0.0",
        latest: "2.0.0",
      },
      {
        id: "deprecated-pkg",
        name: "deprecated-pkg",
        current: "1.0.0",
        latest: "2.0.0",
        note: "deprecated",
      },
    ]);
  });

  it("update runs `pnpm add -g <pkg>@latest`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new PnpmGlobalProvider().update("foo")).resolves.toEqual({
      id: "foo",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("pnpm", [
      "add",
      "-g",
      "foo@latest",
    ]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PnpmGlobalProvider().update("foo")).resolves.toEqual({
      id: "foo",
      success: false,
    });
  });

  it("updateAll [] -> []", async () => {
    await expect(new PnpmGlobalProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll bulk-installs", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PnpmGlobalProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("pnpm", [
      "add",
      "-g",
      "a@latest",
      "b@latest",
    ]);
  });
});

// ----------------------------------------------------------------------------
// VoltaProvider
// ----------------------------------------------------------------------------
describe("VoltaProvider", () => {
  it("isAvailable returns commandExists('volta')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new VoltaProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("volta");
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new VoltaProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nope"));
    await expect(new VoltaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new VoltaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.1.1");
    await expect(new VoltaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("v1.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    const rows = await new VoltaProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "volta",
        name: "Volta",
        current: "1.1.1",
        latest: "1.2.0",
        note: "via scoop",
      },
    ]);
  });

  it("listOutdated flags manual", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    const rows = await new VoltaProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("update delegates with the correct package ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "volta", success: true });
    await new VoltaProvider().update("volta");
    const call = delegateUpdateMock.mock.calls[0]![0];
    expect(call).toMatchObject({
      id: "volta",
      binary: "volta",
      packageIds: { scoop: "volta", choco: "volta", winget: "Volta.Volta" },
    });
    expect(call.manualMessage).toContain("volta-cli/volta");
  });

  it("updateAll [] -> []", async () => {
    await expect(new VoltaProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll returns one outcome", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "volta", success: true });
    const res = await new VoltaProvider().updateAll([
      { id: "volta", current: "1.1.1", latest: "1.2.0" },
    ]);
    expect(res).toEqual([{ id: "volta", success: true }]);
  });
});

// ----------------------------------------------------------------------------
// YarnGlobalProvider
// ----------------------------------------------------------------------------
describe("YarnGlobalProvider", () => {
  it("isAvailable returns false when yarn binary is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new YarnGlobalProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns false when yarn major != 1", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("4.5.0"));
    await expect(new YarnGlobalProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when yarn major == 1", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("1.22.19"));
    await expect(new YarnGlobalProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when version output is empty/no leading int", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new YarnGlobalProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when global list yields no entries", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing relevant"));
    await expect(new YarnGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated filters out same-version and null-latest entries", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          'info "typescript@5.0.0" has binaries:',
          'info "prettier@3.0.0" has binaries:',
          'info "@scope/pkg@1.0.0" has binaries:',
        ].join("\n"),
      ),
    );
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("typescript")) return jsonResponse({ version: "5.1.0" });
      if (url.includes("prettier")) return jsonResponse({ version: "3.0.0" });
      // @scope/pkg fetch fails
      return jsonResponse({}, false);
    });

    const rows = await new YarnGlobalProvider().listOutdated();
    expect(rows).toEqual([
      { id: "typescript", name: "typescript", current: "5.0.0", latest: "5.1.0" },
    ]);
  });

  it("listOutdated swallows fetch errors", async () => {
    runMock.mockResolvedValueOnce(mkRun('info "ts@5.0.0" has binaries: ts'));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new YarnGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when registry has no version field", async () => {
    runMock.mockResolvedValueOnce(mkRun('info "ts@5.0.0" has binaries: ts'));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new YarnGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `yarn global add <pkg>@latest`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new YarnGlobalProvider().update("ts")).resolves.toEqual({
      id: "ts",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("yarn", [
      "global",
      "add",
      "ts@latest",
    ]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new YarnGlobalProvider().update("ts")).resolves.toEqual({
      id: "ts",
      success: false,
    });
  });

  it("updateAll [] -> []", async () => {
    await expect(new YarnGlobalProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll bulk-installs and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new YarnGlobalProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: false },
      { id: "b", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("yarn", [
      "global",
      "add",
      "a@latest",
      "b@latest",
    ]);
  });
});
