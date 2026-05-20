import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: vi.fn(),
  whichFirst: vi.fn(),
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

import { CabalProvider } from "../../src/providers/lang-other/cabal.js";
import { FlutterProvider } from "../../src/providers/lang-other/flutter.js";
import { GemProvider } from "../../src/providers/lang-other/gem.js";
import { HexProvider } from "../../src/providers/lang-other/hex.js";
import { JuliaPkgProvider } from "../../src/providers/lang-other/julia-pkg.js";
import { LuaRocksProvider } from "../../src/providers/lang-other/luarocks.js";
import { MixArchiveProvider } from "../../src/providers/lang-other/mix-archive.js";
import { NimbleProvider } from "../../src/providers/lang-other/nimble.js";
import { OpamProvider } from "../../src/providers/lang-other/opam.js";
import { PubGlobalProvider } from "../../src/providers/lang-other/pub-global.js";
import { RPackagesProvider } from "../../src/providers/lang-other/r-packages.js";
import { StackProvider } from "../../src/providers/lang-other/stack.js";

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
  fetchGitHubReleaseLatestMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// CabalProvider
// ---------------------------------------------------------------------------
describe("CabalProvider", () => {
  it("isAvailable returns true when cabal exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new CabalProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("cabal");
  });

  it("isAvailable returns false when cabal missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new CabalProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when stdout has no version match", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage output"));
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when Hackage responds !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("cabal-install version 3.10.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when normal-version is absent", async () => {
    runMock.mockResolvedValueOnce(mkRun("cabal-install version 3.10.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("cabal-install version 3.10.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("cabal-install version 3.10.2.1"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ "normal-version": ["3.10.2.1"] }),
    );
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("cabal-install version 3.10.0.0"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ "normal-version": ["3.10.2.1"] }),
    );
    const rows = await new CabalProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "cabal-install",
        name: "cabal-install",
        current: "3.10.0.0",
        latest: "3.10.2.1",
      },
    ]);
  });

  it("update succeeds when cabal install succeeds", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CabalProvider().update("cabal-install");
    expect(res).toEqual({ id: "cabal-install", success: true });
    expect(runMock).toHaveBeenCalledWith("cabal", ["update"]);
    expect(runInheritMock).toHaveBeenCalledWith("cabal", [
      "install",
      "cabal-install",
      "--overwrite-policy=always",
    ]);
  });

  it("update fails when cabal install fails", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new CabalProvider().update("cabal-install");
    expect(res).toEqual({ id: "cabal-install", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new CabalProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs update once when packages present", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CabalProvider().updateAll([
      { id: "cabal-install", current: "3.10.0.0", latest: "3.10.2.1" },
    ]);
    expect(res).toEqual([{ id: "cabal-install", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// FlutterProvider
// ---------------------------------------------------------------------------
describe("FlutterProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new FlutterProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new FlutterProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when stdout is not JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when frameworkVersion missing", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ channel: "stable" })));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when releases API responds !ok", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0", channel: "stable" })),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current_release missing the channel hash", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0", channel: "stable" })),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ current_release: {} }));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when matching release entry not found", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0", channel: "stable" })),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        current_release: { stable: "abc" },
        releases: [{ hash: "other", channel: "stable", version: "3.21.0" }],
      }),
    );
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0", channel: "stable" })),
    );
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0", channel: "stable" })),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        current_release: { stable: "abc" },
        releases: [{ hash: "abc", channel: "stable", version: "3.20.0" }],
      }),
    );
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ (default channel fallback)", async () => {
    // Omit channel to exercise the `?? "stable"` fallback.
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0" })),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        current_release: { stable: "abc" },
        releases: [{ hash: "abc", channel: "stable", version: "3.21.0" }],
      }),
    );
    const rows = await new FlutterProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "flutter",
        name: "Flutter",
        current: "3.20.0",
        latest: "3.21.0",
        note: "channel stable",
      },
    ]);
  });

  it("listOutdated honors explicit beta channel", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ frameworkVersion: "3.20.0", channel: "beta" })),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        current_release: { beta: "deadbeef" },
        releases: [{ hash: "deadbeef", channel: "beta", version: "3.22.0-beta" }],
      }),
    );
    const rows = await new FlutterProvider().listOutdated();
    expect(rows[0]?.note).toBe("channel beta");
    expect(rows[0]?.latest).toBe("3.22.0-beta");
  });

  it("update succeeds when flutter upgrade succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FlutterProvider().update("flutter");
    expect(res).toEqual({ id: "flutter", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("flutter", ["upgrade"]);
  });

  it("update fails when flutter upgrade fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new FlutterProvider().update("flutter");
    expect(res).toEqual({ id: "flutter", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new FlutterProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FlutterProvider().updateAll([
      { id: "flutter", current: "3.20.0", latest: "3.21.0" },
    ]);
    expect(res).toEqual([{ id: "flutter", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// GemProvider
// ---------------------------------------------------------------------------
describe("GemProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new GemProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new GemProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when gem outdated fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new GemProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses valid lines and skips invalid ones", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "rake (13.0.6 < 13.1.0)",
          "bundler (2.4.0 < 2.5.0)",
          "noise without parens",
          "",
          "  rails (7.0.0 < 7.1.0)  ",
        ].join("\n"),
      ),
    );
    const rows = await new GemProvider().listOutdated();
    expect(rows).toEqual([
      { id: "rake", name: "rake", current: "13.0.6", latest: "13.1.0" },
      { id: "bundler", name: "bundler", current: "2.4.0", latest: "2.5.0" },
      { id: "rails", name: "rails", current: "7.0.0", latest: "7.1.0" },
    ]);
  });

  it("update succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GemProvider().update("rake");
    expect(res).toEqual({ id: "rake", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("gem", ["update", "rake"]);
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GemProvider().update("rake");
    expect(res).toEqual({ id: "rake", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new GemProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs a single `gem update` and maps outcomes per package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GemProvider().updateAll([
      { id: "rake", current: "13.0.6", latest: "13.1.0" },
      { id: "bundler", current: "2.4.0", latest: "2.5.0" },
    ]);
    expect(res).toEqual([
      { id: "rake", success: true },
      { id: "bundler", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("gem", ["update"]);
  });

  it("updateAll propagates failure to every package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GemProvider().updateAll([
      { id: "rake", current: "13.0.6", latest: "13.1.0" },
    ]);
    expect(res).toEqual([{ id: "rake", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// HexProvider
// ---------------------------------------------------------------------------
describe("HexProvider", () => {
  it("isAvailable returns false when mix is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new HexProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns false when mix is present but `mix hex --version` fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HexProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when mix + hex archive both work", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("Hex v2.0.6"));
    await expect(new HexProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current can't be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing useful here"));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when hex.pm responds !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("Hex v2.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no version fields present", async () => {
    runMock.mockResolvedValueOnce(mkRun("Hex v2.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("Hex v2.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest_stable_version", async () => {
    runMock.mockResolvedValueOnce(mkRun("Hex v2.0.6"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ latest_stable_version: "2.0.6" }),
    );
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated falls back to latest_version when stable missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("Hex v2.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ latest_version: "2.0.6" }));
    const rows = await new HexProvider().listOutdated();
    expect(rows).toEqual([
      { id: "hex", name: "Hex", current: "2.0.0", latest: "2.0.6" },
    ]);
  });

  it("update calls mix local.hex --force", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HexProvider().update("hex");
    expect(res).toEqual({ id: "hex", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("mix", [
      "local.hex",
      "--force",
    ]);
  });

  it("update reports failure when the run fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new HexProvider().update("hex");
    expect(res).toEqual({ id: "hex", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new HexProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HexProvider().updateAll([
      { id: "hex", current: "2.0.0", latest: "2.0.6" },
    ]);
    expect(res).toEqual([{ id: "hex", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// JuliaPkgProvider
// ---------------------------------------------------------------------------
describe("JuliaPkgProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new JuliaPkgProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new JuliaPkgProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when the probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new JuliaPkgProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses '[uuid] Name vCURRENT (<vLATEST)' lines", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "Status `~/.julia/environments/v1.10/Project.toml`",
          "  [12345abc-1234-5678-1234-1234567890ab] Plots v1.2.3 (<v1.3.0)",
          "  [aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee] DataFrames v0.22.0 (<v0.23.0)",
          "  some garbage line that should not match",
          "",
        ].join("\n"),
      ),
    );
    const rows = await new JuliaPkgProvider().listOutdated();
    expect(rows).toEqual([
      { id: "Plots", name: "Plots", current: "1.2.3", latest: "1.3.0" },
      {
        id: "DataFrames",
        name: "DataFrames",
        current: "0.22.0",
        latest: "0.23.0",
      },
    ]);
  });

  it("update runs Pkg.update and returns success", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new JuliaPkgProvider().update("anything");
    expect(res).toEqual({ id: "julia-pkg", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("julia", [
      "--startup-file=no",
      "-e",
      "using Pkg; Pkg.update()",
    ]);
  });

  it("update reports failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new JuliaPkgProvider().update("x");
    expect(res).toEqual({ id: "julia-pkg", success: false });
  });

  it("updateAll returns [] when empty", async () => {
    await expect(new JuliaPkgProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs one bulk Pkg.update and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new JuliaPkgProvider().updateAll([
      { id: "Plots", current: "1.2.3", latest: "1.3.0" },
      { id: "DataFrames", current: "0.22", latest: "0.23" },
    ]);
    expect(res).toEqual([
      { id: "Plots", success: true },
      { id: "DataFrames", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("updateAll maps failure to every package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new JuliaPkgProvider().updateAll([
      { id: "Plots", current: "1.2.3", latest: "1.3.0" },
    ]);
    expect(res).toEqual([{ id: "Plots", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// LuaRocksProvider
// ---------------------------------------------------------------------------
describe("LuaRocksProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new LuaRocksProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new LuaRocksProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new LuaRocksProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses TSV, skipping blanks, malformed rows and unchanged versions", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "lpeg\t1.0.0\t1.1.0\thttps://luarocks.org",
          "luaposix\t34.0\t35.0\thttps://luarocks.org",
          "same\t1.0\t1.0\thttps://luarocks.org",
          "  ",
          "incomplete-line",
        ].join("\n"),
      ),
    );
    const rows = await new LuaRocksProvider().listOutdated();
    expect(rows).toEqual([
      { id: "lpeg", name: "lpeg", current: "1.0.0", latest: "1.1.0" },
      {
        id: "luaposix",
        name: "luaposix",
        current: "34.0",
        latest: "35.0",
      },
    ]);
  });

  it("update succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new LuaRocksProvider().update("lpeg");
    expect(res).toEqual({ id: "lpeg", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("luarocks", [
      "--local",
      "install",
      "lpeg",
    ]);
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new LuaRocksProvider().update("lpeg");
    expect(res).toEqual({ id: "lpeg", success: false });
  });

  it("updateAll iterates per-package sequentially", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new LuaRocksProvider().updateAll([
      { id: "lpeg", current: "1.0.0", latest: "1.1.0" },
      { id: "luaposix", current: "34.0", latest: "35.0" },
    ]);
    expect(res).toEqual([
      { id: "lpeg", success: true },
      { id: "luaposix", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(2);
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new LuaRocksProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MixArchiveProvider
// ---------------------------------------------------------------------------
describe("MixArchiveProvider", () => {
  it("isAvailable false when mix missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new MixArchiveProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable false when `mix archive` fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MixArchiveProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when mix archive succeeds", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new MixArchiveProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when mix archive fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MixArchiveProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no archive lines match", async () => {
    runMock.mockResolvedValueOnce(mkRun("no archives found"));
    await expect(new MixArchiveProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated parses '* name-version', skips up-to-date and filters fetch errors", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "Mix archives:",
          "* hex-2.0.0",
          "* phx_new-1.7.0",
          "* nerves_bootstrap-1.12.0",
          "* up_to_date-9.9.9",
          "garbage",
        ].join("\n"),
      ),
    );
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/phx_new"))
        return jsonResponse({ latest_version: "1.7.10" });
      if (url.endsWith("/nerves_bootstrap"))
        return jsonResponse({}, false); // !ok -> drop
      if (url.endsWith("/up_to_date"))
        return jsonResponse({ latest_stable_version: "9.9.9" }); // unchanged -> drop
      if (url.endsWith("/hex"))
        return jsonResponse({ latest_stable_version: "2.0.6" });
      return jsonResponse({}, false);
    });

    const rows = await new MixArchiveProvider().listOutdated();
    expect(rows).toEqual([
      { id: "hex", name: "hex", current: "2.0.0", latest: "2.0.6" },
      { id: "phx_new", name: "phx_new", current: "1.7.0", latest: "1.7.10" },
    ]);
  });

  it("listOutdated handles fetch throwing for an entry", async () => {
    runMock.mockResolvedValueOnce(mkRun("* hex-2.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new MixArchiveProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update succeeds and uses mix archive.install hex <pkg> --force", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new MixArchiveProvider().update("phx_new");
    expect(res).toEqual({ id: "phx_new", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("mix", [
      "archive.install",
      "hex",
      "phx_new",
      "--force",
    ]);
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new MixArchiveProvider().update("phx_new");
    expect(res).toEqual({ id: "phx_new", success: false });
  });

  it("updateAll iterates sequentially", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new MixArchiveProvider().updateAll([
      { id: "hex", current: "2.0.0", latest: "2.0.6" },
      { id: "phx_new", current: "1.7.0", latest: "1.7.10" },
    ]);
    expect(res).toEqual([
      { id: "hex", success: true },
      { id: "phx_new", success: false },
    ]);
  });

  it("updateAll returns [] on empty", async () => {
    await expect(new MixArchiveProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NimbleProvider
// ---------------------------------------------------------------------------
describe("NimbleProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new NimbleProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NimbleProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when nimble list fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when no installed lines match", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing here"));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when registry fetch responds !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("nimble [0.13.1]"));
    fetchMock.mockResolvedValueOnce(jsonResponse([], false));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when registry fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("nimble [0.13.1]"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles registry without url/name entries (no rows)", async () => {
    runMock.mockResolvedValueOnce(mkRun("nimble [0.13.1]"));
    // Entry missing url, plus a junk entry without name.
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ name: "nimble" }, { url: "http://x" }]),
    );
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops packages not in registry", async () => {
    runMock.mockResolvedValueOnce(mkRun("unknownpkg [1.0.0]"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { name: "other", url: "https://github.com/foo/other" },
      ]),
    );
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops non-GitHub URLs", async () => {
    runMock.mockResolvedValueOnce(mkRun("mypkg [1.0.0]"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { name: "mypkg", url: "https://gitlab.com/foo/bar" },
      ]),
    );
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops package when release fetch fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("mypkg [1.0.0]"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          { name: "mypkg", url: "https://github.com/foo/mypkg" },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops package when release fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("mypkg [1.0.0]"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          { name: "mypkg", url: "https://github.com/foo/mypkg" },
        ]),
      )
      .mockRejectedValueOnce(new Error("net"));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops package when tag_name absent", async () => {
    runMock.mockResolvedValueOnce(mkRun("mypkg [1.0.0]"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          { name: "mypkg", url: "https://github.com/foo/mypkg" },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops package when latest equals current", async () => {
    runMock.mockResolvedValueOnce(mkRun("mypkg [1.0.0]"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          { name: "mypkg", url: "https://github.com/foo/mypkg.git" },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ tag_name: "v1.0.0" }));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ (.git suffix stripped)", async () => {
    runMock.mockResolvedValueOnce(mkRun("mypkg [1.0.0]"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          { name: "MyPkg", url: "https://github.com/foo/mypkg.git" },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ tag_name: "v1.2.0" }));
    const rows = await new NimbleProvider().listOutdated();
    expect(rows).toEqual([
      { id: "mypkg", name: "mypkg", current: "1.0.0", latest: "1.2.0" },
    ]);
  });

  it("update succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NimbleProvider().update("mypkg");
    expect(res).toEqual({ id: "mypkg", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("nimble", [
      "install",
      "mypkg",
      "-y",
    ]);
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NimbleProvider().update("mypkg");
    expect(res).toEqual({ id: "mypkg", success: false });
  });

  it("updateAll iterates sequentially", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new NimbleProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: false },
    ]);
  });

  it("updateAll returns [] on empty", async () => {
    await expect(new NimbleProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// OpamProvider
// ---------------------------------------------------------------------------
describe("OpamProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new OpamProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new OpamProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when the list call fails (still runs update)", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new OpamProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenNthCalledWith(1, "opam", ["update", "--quiet"]);
  });

  it("listOutdated parses whitespace-separated rows; skips blanks, comments and unchanged versions", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(
        mkRun(
          [
            "# comment line",
            "",
            "core 4.14.1 4.14.2",
            "dune   3.10.0    3.11.0",
            "same 1.0 1.0",
            "incomplete row",
          ].join("\n"),
        ),
      );
    const rows = await new OpamProvider().listOutdated();
    expect(rows).toEqual([
      { id: "core", name: "core", current: "4.14.1", latest: "4.14.2" },
      { id: "dune", name: "dune", current: "3.10.0", latest: "3.11.0" },
    ]);
  });

  it("update succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new OpamProvider().update("dune");
    expect(res).toEqual({ id: "dune", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("opam", [
      "upgrade",
      "dune",
      "-y",
    ]);
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new OpamProvider().update("dune");
    expect(res).toEqual({ id: "dune", success: false });
  });

  it("updateAll returns [] on empty", async () => {
    await expect(new OpamProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs one bulk upgrade and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new OpamProvider().updateAll([
      { id: "dune", current: "3.10", latest: "3.11" },
      { id: "core", current: "4.14.1", latest: "4.14.2" },
    ]);
    expect(res).toEqual([
      { id: "dune", success: true },
      { id: "core", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("opam", ["upgrade", "-y"]);
  });

  it("updateAll maps failure to every package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new OpamProvider().updateAll([
      { id: "dune", current: "3.10", latest: "3.11" },
    ]);
    expect(res).toEqual([{ id: "dune", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// PubGlobalProvider
// ---------------------------------------------------------------------------
describe("PubGlobalProvider", () => {
  it("isAvailable true when dart exists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PubGlobalProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable true when only flutter exists", async () => {
    commandExistsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(new PubGlobalProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable false when neither exists", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new PubGlobalProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when the list call fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true); // dart present
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PubGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when there are no installed lines", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("\n  \n"));
    await expect(new PubGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated falls back to `flutter` when dart absent", async () => {
    commandExistsMock.mockResolvedValueOnce(false); // dart missing -> uses flutter
    runMock.mockResolvedValueOnce(mkRun(""));
    await new PubGlobalProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("flutter", ["pub", "global", "list"]);
  });

  it("listOutdated parses entries, skips invalid + up-to-date + pub failures", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "stagehand 3.3.11",
          "very_good_cli 0.18.0",
          "same_pkg 1.0.0",
          "  ",
          "Invalid Line",
        ].join("\n"),
      ),
    );
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("stagehand"))
        return jsonResponse({ latest: { version: "3.3.12" } });
      if (url.includes("very_good_cli"))
        return jsonResponse({}, false); // !ok -> drop
      if (url.includes("same_pkg"))
        return jsonResponse({ latest: { version: "1.0.0" } }); // unchanged
      return jsonResponse({}, false);
    });
    const rows = await new PubGlobalProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "stagehand",
        name: "stagehand",
        current: "3.3.11",
        latest: "3.3.12",
      },
    ]);
  });

  it("listOutdated drops entries when fetch throws", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("stagehand 3.3.11"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new PubGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops entry when latest.version is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("stagehand 3.3.11"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ latest: {} }));
    await expect(new PubGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update uses dart when present", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PubGlobalProvider().update("stagehand");
    expect(res).toEqual({ id: "stagehand", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("dart", [
      "pub",
      "global",
      "activate",
      "stagehand",
    ]);
  });

  it("update falls back to flutter when dart absent", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PubGlobalProvider().update("stagehand");
    expect(res).toEqual({ id: "stagehand", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("flutter", [
      "pub",
      "global",
      "activate",
      "stagehand",
    ]);
  });

  it("updateAll iterates sequentially", async () => {
    commandExistsMock.mockResolvedValue(true);
    runInheritMock.mockResolvedValue(mkRun(""));
    const res = await new PubGlobalProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(2);
  });

  it("updateAll returns [] on empty", async () => {
    await expect(new PubGlobalProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RPackagesProvider
// ---------------------------------------------------------------------------
describe("RPackagesProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new RPackagesProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("Rscript");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new RPackagesProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when Rscript fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new RPackagesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses TSV lines and skips blanks/unchanged/malformed", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        [
          "ggplot2\t3.4.0\t3.5.0",
          "dplyr\t1.1.0\t1.1.4",
          "same\t1.0\t1.0",
          "  ",
          "broken",
        ].join("\n"),
      ),
    );
    const rows = await new RPackagesProvider().listOutdated();
    expect(rows).toEqual([
      { id: "ggplot2", name: "ggplot2", current: "3.4.0", latest: "3.5.0" },
      { id: "dplyr", name: "dplyr", current: "1.1.0", latest: "1.1.4" },
    ]);
  });

  it("update rejects package ids that don't match the CRAN-safe allowlist", async () => {
    const res = await new RPackagesProvider().update("d'angerous");
    expect(res).toEqual({ id: "d'angerous", success: false });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update accepts safe package ids and forwards to Rscript", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new RPackagesProvider().update("ggplot2");
    expect(res).toEqual({ id: "ggplot2", success: true });
    const args = runInheritMock.mock.calls[0]![1] as string[];
    expect(args[0]).toBe("--vanilla");
    expect(args[1]).toBe("-e");
    expect(args[2]).toContain("install.packages('ggplot2'");
    expect(args[2]).toContain(".libPaths()[1]");
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new RPackagesProvider().update("ggplot2");
    expect(res).toEqual({ id: "ggplot2", success: false });
  });

  it("updateAll returns [] on empty", async () => {
    await expect(new RPackagesProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs one update.packages call and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new RPackagesProvider().updateAll([
      { id: "ggplot2", current: "3.4.0", latest: "3.5.0" },
      { id: "dplyr", current: "1.1.0", latest: "1.1.4" },
    ]);
    expect(res).toEqual([
      { id: "ggplot2", success: true },
      { id: "dplyr", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    const args = runInheritMock.mock.calls[0]![1] as string[];
    expect(args[2]).toContain("update.packages");
  });

  it("updateAll propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new RPackagesProvider().updateAll([
      { id: "ggplot2", current: "3.4.0", latest: "3.5.0" },
    ]);
    expect(res).toEqual([{ id: "ggplot2", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// StackProvider
// ---------------------------------------------------------------------------
describe("StackProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new StackProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new StackProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new StackProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version line"));
    await expect(new StackProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetchGitHubReleaseLatest returns null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Version 2.15.5, Git revision abc"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new StackProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(
      "commercialhaskell/stack",
    );
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("Version 2.15.5, Git revision abc"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.15.5");
    await expect(new StackProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("Version 2.15.5, Git revision abc"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.16.0");
    const rows = await new StackProvider().listOutdated();
    expect(rows).toEqual([
      { id: "stack", name: "Stack", current: "2.15.5", latest: "2.16.0" },
    ]);
  });

  it("update succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new StackProvider().update("stack");
    expect(res).toEqual({ id: "stack", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("stack", ["upgrade"]);
  });

  it("update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new StackProvider().update("stack");
    expect(res).toEqual({ id: "stack", success: false });
  });

  it("updateAll returns [] on empty", async () => {
    await expect(new StackProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new StackProvider().updateAll([
      { id: "stack", current: "2.15.5", latest: "2.16.0" },
    ]);
    expect(res).toEqual([{ id: "stack", success: true }]);
  });
});
