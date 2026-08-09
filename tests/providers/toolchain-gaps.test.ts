import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The four version-manager providers that shipped without a suite: the xcodes
 * binary tracker, swiftly, and the two POSIX originals — pyenv and nvm — whose
 * Windows namesakes (pyenv-win, nvm-windows) are separate upstream projects
 * living behind the opposite platform gate.
 */

const { commandExistsMock, runMock, runInheritMock, whichFirstMock } = vi.hoisted(
  () => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }),
);

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  whichFirst: whichFirstMock,
  isElevated: vi.fn(),
}));

const {
  delegateUpdateMock,
  detectInstallSourceMock,
  describeSourceMock,
  runPmUpdateMock,
  resolveBinaryPathMock,
} = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
  detectInstallSourceMock: vi.fn(),
  describeSourceMock: vi.fn(),
  runPmUpdateMock: vi.fn(),
  resolveBinaryPathMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
  runPmUpdate: runPmUpdateMock,
  resolveBinaryPath: resolveBinaryPathMock,
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

// normalizeVersion stays real: every comparator under test is built on it.
vi.mock("../../src/core/gh-releases.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
      "../../src/core/gh-releases.js",
    );
  return { ...actual, fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock };
});

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn() }));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: homedirMock };
});

import {
  XcodesProvider,
  isXcodesUpgrade,
  parseXcodesVersion,
} from "../../src/providers/embedded-mobile/xcodes.js";
import {
  SwiftlyProvider,
  isUpgrade,
  parseSwiftlyVersion,
} from "../../src/providers/toolchain/swiftly.js";
import {
  PyenvProvider,
  compareReleases as comparePyenvReleases,
  parsePyenvVersion,
} from "../../src/providers/python/pyenv.js";
import {
  NvmProvider,
  compareReleases as compareNvmReleases,
  parseNvmVersion,
} from "../../src/providers/node/nvm.js";
import { PyenvWinProvider } from "../../src/providers/python/pyenv-win.js";
import { NvmWindowsProvider } from "../../src/providers/node/nvm-windows.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

let envSnapshot: NodeJS.ProcessEnv;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  whichFirstMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  resolveBinaryPathMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  existsSyncMock.mockReset();
  homedirMock.mockReset();

  // Defaults chosen so nothing silently reaches the real machine: no file
  // exists, PATH resolves to nothing, and the install source is "unknown".
  existsSyncMock.mockReturnValue(false);
  whichFirstMock.mockResolvedValue(null);
  resolveBinaryPathMock.mockResolvedValue(null);
  homedirMock.mockReturnValue("/home/u");
  detectInstallSourceMock.mockResolvedValue("manual");
  describeSourceMock.mockImplementation((src: string) =>
    src === "manual" ? "manuel" : `via ${src}`,
  );

  // Every upstream lookup in this file goes through the mocked
  // fetchGitHubReleaseLatest; a live fetch would mean a provider found a path
  // to the network that these tests do not control.
  fetchMock = vi.fn(() => {
    throw new Error("no network in tests");
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  envSnapshot = { ...process.env };
  delete process.env["PYENV_ROOT"];
  delete process.env["NVM_DIR"];
  delete process.env["XDG_CONFIG_HOME"];
});

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  process.env = envSnapshot;
  setPlatform(ORIGINAL_PLATFORM);
});

// ===========================================================================
// xcodes — the Xcode version manager binary (never the Xcode releases)
// ===========================================================================

describe("XcodesProvider.isAvailable", () => {
  it("is macOS-only, and does not even probe the binary elsewhere", async () => {
    commandExistsMock.mockResolvedValue(true);
    for (const platform of ["win32", "linux"] as NodeJS.Platform[]) {
      setPlatform(platform);
      await expect(new XcodesProvider().isAvailable()).resolves.toBe(false);
    }
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("probes `xcodes` on macOS", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new XcodesProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("xcodes");

    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new XcodesProvider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable rather than throwing when the probe blows up", async () => {
    setPlatform("darwin");
    commandExistsMock.mockRejectedValueOnce(new Error("PATH exploded"));
    await expect(new XcodesProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseXcodesVersion", () => {
  it("reads the bare semver `xcodes version` prints", () => {
    expect(parseXcodesVersion("2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("2.0.3\n")).toBe("2.0.3");
  });

  it("tolerates a decorated line (leading v, tool name, `version` word)", () => {
    expect(parseXcodesVersion("v2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("xcodes 2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("xcodes version 2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("2.1")).toBe("2.1");
    expect(parseXcodesVersion("2.1.0-beta.1")).toBe("2.1.0-beta.1");
  });

  it("strips SGR colour codes before matching the anchored line", () => {
    expect(parseXcodesVersion("\u001b[32m2.0.3\u001b[0m")).toBe("2.0.3");
  });

  it("skips a first-run notice printed above the answer", () => {
    const stdout = "Migrating cache to ~/Library/Caches/com.xcodesorg.xcodes\n2.0.3\n";
    expect(parseXcodesVersion(stdout)).toBe("2.0.3");
  });

  it("refuses a bare integer, a year, blank and garbage input", () => {
    expect(parseXcodesVersion("2")).toBeNull();
    expect(parseXcodesVersion("2024")).toBeNull();
    expect(parseXcodesVersion("")).toBeNull();
    expect(parseXcodesVersion("   \n\n  ")).toBeNull();
    expect(parseXcodesVersion("error: no such subcommand 'version'")).toBeNull();
  });

  it("refuses a line that carries anything besides the version", () => {
    expect(parseXcodesVersion("xcodes 2.0.3 (build 42)")).toBeNull();
  });

  it("keeps a build-metadata suffix and survives CRLF line endings", () => {
    expect(parseXcodesVersion("2.0.3+sha.abc123")).toBe("2.0.3+sha.abc123");
    expect(parseXcodesVersion("warning: cache\r\n2.0.3\r\n")).toBe("2.0.3");
  });
});

describe("isXcodesUpgrade", () => {
  it("only fires when the published core is strictly newer", () => {
    expect(isXcodesUpgrade("2.0.3", "2.0.4")).toBe(true);
    expect(isXcodesUpgrade("2.0.3", "2.0.3")).toBe(false);
    expect(isXcodesUpgrade("2.1.0", "2.0.3")).toBe(false);
  });

  it("sorts 2.10 above 2.9 instead of comparing as strings", () => {
    expect(isXcodesUpgrade("2.9.0", "2.10.0")).toBe(true);
    expect(isXcodesUpgrade("2.10.0", "2.9.0")).toBe(false);
  });

  it("compares missing trailing segments as zero", () => {
    expect(isXcodesUpgrade("2.0", "2.0.1")).toBe(true);
    expect(isXcodesUpgrade("2.0.0", "2.0")).toBe(false);
  });

  it("lets the release supersede the pre-release built from it, never the reverse", () => {
    expect(isXcodesUpgrade("2.1.0-beta.1", "2.1.0")).toBe(true);
    expect(isXcodesUpgrade("2.1.0", "2.1.0-beta.1")).toBe(false);
    expect(isXcodesUpgrade("2.1.0-beta.2", "2.1.0-beta.1")).toBe(false);
  });

  it("treats an unparseable segment as zero rather than throwing", () => {
    expect(isXcodesUpgrade("main", "1.0.0")).toBe(true);
    expect(isXcodesUpgrade("1.0.0", "main")).toBe(false);
  });

  it("stays quiet between two pre-releases of the same core", () => {
    expect(isXcodesUpgrade("2.1.0-beta.1", "2.1.0-beta.1")).toBe(false);
    // A newer core still wins, pre-release or not.
    expect(isXcodesUpgrade("2.0.0-beta.1", "2.1.0-beta.1")).toBe(true);
  });
});

describe("XcodesProvider.listOutdated", () => {
  it("asks for `xcodes version` and returns [] when it fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledWith("xcodes", ["version"]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when the version line is unrecognised", async () => {
    runMock.mockResolvedValueOnce(mkRun("OVERVIEW: Manage the Xcodes installed"));
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when GitHub has no answer", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.0.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("XcodesOrg/xcodes");
  });

  it("returns [] when the installed version is current", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.0.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.0.3");
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] for a HEAD build advertising a version ahead of the last tag", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.1.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.0.3");
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    // No row means no install-source probe and, above all, no spawn.
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("emits a row carrying the owning package manager, never `manual: true`", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.0.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.1.0");
    detectInstallSourceMock.mockResolvedValueOnce("brew");

    const rows = await new XcodesProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "xcodes",
        name: "xcodes",
        current: "2.0.3",
        latest: "2.1.0",
        note: "via brew",
      },
    ]);
    expect(rows[0]).not.toHaveProperty("manual");
    expect(detectInstallSourceMock).toHaveBeenCalledWith("xcodes");
    // `xcodes update` refreshes the catalogue of available Xcodes; it never
    // upgrades the tool, so the scan must not be tempted into calling it.
    expect(runMock).not.toHaveBeenCalledWith("xcodes", ["update"]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("announces the hand-install path instead of hiding the row", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.0.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.1.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");

    const rows = await new XcodesProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      note: "installation manuelle — mise à jour à faire à la main",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("returns [] rather than throwing when the spawn is rejected", async () => {
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when the releases lookup itself rejects", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.0.3"));
    fetchGitHubReleaseLatestMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when the install-source probe rejects after a real upgrade", async () => {
    runMock.mockResolvedValueOnce(mkRun("2.0.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.1.0");
    detectInstallSourceMock.mockRejectedValueOnce(new Error("brew --prefix died"));
    // Losing the note is not worth aborting the whole scan over: the provider
    // drops its row instead of throwing out of listOutdated.
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("XcodesProvider.update", () => {
  it("delegates to the Homebrew formula and nothing else", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "xcodes", success: true });
    await expect(new XcodesProvider().update("xcodes")).resolves.toEqual({
      id: "xcodes",
      success: true,
    });

    const call = delegateUpdateMock.mock.calls[0]![0];
    expect(call).toMatchObject({
      id: "xcodes",
      binary: "xcodes",
      packageIds: { brew: "xcodes" },
    });
    expect(Object.keys(call.packageIds)).toEqual(["brew"]);
    expect(call.manualMessage).toContain("github.com/XcodesOrg/xcodes/releases");
    // No Xcode download is ever triggered, and `xcodes update` is not a
    // self-update: the provider spawns nothing of its own.
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("passes a skipped outcome from the delegation straight through", async () => {
    delegateUpdateMock.mockResolvedValueOnce({
      id: "xcodes",
      success: false,
      skipped: true,
      message: "manual",
    });
    await expect(new XcodesProvider().update("xcodes")).resolves.toMatchObject({
      success: false,
      skipped: true,
    });
  });

  it("fails soft when the delegation itself throws", async () => {
    delegateUpdateMock.mockRejectedValueOnce(new Error("boom"));
    const res = await new XcodesProvider().update("xcodes");
    expect(res).toEqual({
      id: "xcodes",
      success: false,
      message: "xcodes est introuvable ou la mise à jour n'a pas pu être lancée.",
    });
  });
});

describe("XcodesProvider.updateAll", () => {
  it("does nothing at all for an empty set", async () => {
    await expect(new XcodesProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("collapses to a single delegation", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "xcodes", success: true });
    const res = await new XcodesProvider().updateAll([
      { id: "xcodes", current: "2.0.3", latest: "2.1.0" },
    ]);
    expect(res).toEqual([{ id: "xcodes", success: true }]);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("still delegates once even if the caller passes several rows", async () => {
    delegateUpdateMock.mockResolvedValue({ id: "xcodes", success: true });
    const res = await new XcodesProvider().updateAll([
      { id: "xcodes", current: "2.0.3", latest: "2.1.0" },
      { id: "xcodes", current: "2.0.3", latest: "2.1.0" },
    ]);
    expect(res).toHaveLength(1);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("XcodesProvider.installHint", () => {
  it("names the tap formula on macOS and refuses to invent one elsewhere", () => {
    setPlatform("darwin");
    expect(new XcodesProvider().installHint).toBe(
      "brew install xcodesorg/made/xcodes",
    );

    for (const platform of ["win32", "linux", "freebsd"] as NodeJS.Platform[]) {
      setPlatform(platform);
      const hint = new XcodesProvider().installHint;
      expect(hint).toContain("macOS uniquement");
      expect(hint).not.toContain("brew install");
    }
  });
});

// ===========================================================================
// swiftly — the Swift toolchain manager binary
// ===========================================================================

describe("SwiftlyProvider.isAvailable", () => {
  it("refuses Windows without probing — upstream ships no Windows build", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("probes `swiftly` on macOS and Linux", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("darwin");
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(true);
    setPlatform("linux");
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("swiftly");
  });

  it("is unavailable when the binary is missing or the probe throws", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(false);

    commandExistsMock.mockRejectedValueOnce(new Error("nope"));
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseSwiftlyVersion", () => {
  it("reads the bare version swift-argument-parser prints", () => {
    expect(parseSwiftlyVersion("1.1.3")).toBe("1.1.3");
    expect(parseSwiftlyVersion("1.1.3\n")).toBe("1.1.3");
  });

  it("keeps the development-branch suffix intact", () => {
    expect(parseSwiftlyVersion("1.3.0-dev")).toBe("1.3.0-dev");
  });

  it("tolerates a decorated line", () => {
    expect(parseSwiftlyVersion("swiftly 1.1.3")).toBe("1.1.3");
    expect(parseSwiftlyVersion("v1.1.3")).toBe("1.1.3");
    expect(parseSwiftlyVersion("1.1")).toBe("1.1");
  });

  it("skips a warning printed above the version", () => {
    expect(parseSwiftlyVersion("warning: no toolchain in use\n1.1.3")).toBe("1.1.3");
  });

  it("returns null on blank, garbage and a line carrying extra text", () => {
    expect(parseSwiftlyVersion("")).toBeNull();
    expect(parseSwiftlyVersion("\n \n")).toBeNull();
    expect(parseSwiftlyVersion("USAGE: swiftly <subcommand>")).toBeNull();
    expect(parseSwiftlyVersion("swiftly version 1.1.3")).toBeNull();
  });
});

describe("swiftly isUpgrade", () => {
  it("only fires when the published core is strictly newer", () => {
    expect(isUpgrade("1.1.3", "1.2.0")).toBe(true);
    expect(isUpgrade("1.1.3", "1.1.3")).toBe(false);
    expect(isUpgrade("1.2.0", "1.1.3")).toBe(false);
  });

  it("sorts 1.10 above 1.9 instead of comparing as strings", () => {
    expect(isUpgrade("1.9.0", "1.10.0")).toBe(true);
    expect(isUpgrade("1.10.0", "1.9.0")).toBe(false);
  });

  it("never proposes a downgrade from a development build", () => {
    expect(isUpgrade("1.3.0-dev", "1.1.3")).toBe(false);
    expect(isUpgrade("1.1.3-dev", "1.1.3")).toBe(true);
    expect(isUpgrade("1.1.3", "1.1.3-dev")).toBe(false);
  });

  it("compares missing trailing segments as zero and survives garbage", () => {
    expect(isUpgrade("1.1", "1.1.1")).toBe(true);
    expect(isUpgrade("1.1.0", "1.1")).toBe(false);
    expect(isUpgrade("main", "1.0.0")).toBe(true);
  });

  it("stays quiet between two pre-releases of the same core", () => {
    expect(isUpgrade("1.3.0-dev", "1.3.0-dev")).toBe(false);
    expect(isUpgrade("1.2.0-dev", "1.3.0-dev")).toBe(true);
  });
});

describe("SwiftlyProvider.listOutdated", () => {
  it("asks for `swiftly --version` and returns [] when it fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledWith("swiftly", ["--version"]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when the version line is unrecognised", async () => {
    runMock.mockResolvedValueOnce(mkRun("USAGE: swiftly <subcommand>"));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    // An unreadable version must not cost a GitHub round-trip.
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when GitHub has no answer", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("swiftlang/swiftly");
  });

  it("returns [] when current, and for a dev build ahead of the tag", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.1.3");
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);

    runMock.mockResolvedValueOnce(mkRun("1.3.0-dev"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.1.3");
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("announces `swiftly self-update` for a self-managed install", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");

    const rows = await new SwiftlyProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "swiftly",
        name: "swiftly",
        current: "1.1.3",
        latest: "1.2.0",
        note: "swiftly self-update",
      },
    ]);
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("announces the owning package manager for a brew install", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockResolvedValueOnce("brew");

    const rows = await new SwiftlyProvider().listOutdated();
    expect(rows[0]).toMatchObject({ note: "via brew" });
    expect(detectInstallSourceMock).toHaveBeenCalledWith("swiftly");
  });

  it("returns [] rather than throwing when the spawn is rejected", async () => {
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when the releases lookup itself rejects", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.3"));
    fetchGitHubReleaseLatestMock.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when the install-source probe rejects after a real upgrade", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.1.3"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.0");
    detectInstallSourceMock.mockRejectedValueOnce(new Error("which exploded"));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("SwiftlyProvider.update", () => {
  it("runs `swiftly self-update --assume-yes` for a self-managed install", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await expect(new SwiftlyProvider().update("swiftly")).resolves.toEqual({
      id: "swiftly",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("swiftly", [
      "self-update",
      "--assume-yes",
    ]);
    expect(runPmUpdateMock).not.toHaveBeenCalled();
  });

  it("reports the external-install wording when self-update fails", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));

    const res = await new SwiftlyProvider().update("swiftly");
    expect(res).toMatchObject({ id: "swiftly", success: false });
    expect(res.message).toContain("self-update");
  });

  it("hands a package-manager-owned binary to its manager", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("brew");
    runPmUpdateMock.mockResolvedValueOnce({ id: "swiftly", success: true });

    await expect(new SwiftlyProvider().update("swiftly")).resolves.toEqual({
      id: "swiftly",
      success: true,
    });
    const [id, source, ids, message] = runPmUpdateMock.mock.calls[0]!;
    expect(id).toBe("swiftly");
    expect(source).toBe("brew");
    expect(ids).toEqual({ brew: "swiftly" });
    expect(message).toContain("self-update");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("fails soft when the source detection throws", async () => {
    detectInstallSourceMock.mockRejectedValueOnce(new Error("which exploded"));
    await expect(new SwiftlyProvider().update("swiftly")).resolves.toEqual({
      id: "swiftly",
      success: false,
      message: "swiftly est introuvable ou n'a pas pu être lancé.",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(runPmUpdateMock).not.toHaveBeenCalled();
  });

  it("fails soft when the self-update spawn is rejected outright", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    runInheritMock.mockRejectedValueOnce(new Error("ENOENT swiftly"));

    await expect(new SwiftlyProvider().update("swiftly")).resolves.toEqual({
      id: "swiftly",
      success: false,
      message: "swiftly est introuvable ou n'a pas pu être lancé.",
    });
  });

  it("fails soft when the package-manager delegation rejects", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("brew");
    runPmUpdateMock.mockRejectedValueOnce(new Error("brew exploded"));

    await expect(new SwiftlyProvider().update("swiftly")).resolves.toMatchObject({
      id: "swiftly",
      success: false,
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("SwiftlyProvider.updateAll", () => {
  it("does nothing at all for an empty set", async () => {
    await expect(new SwiftlyProvider().updateAll([])).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("collapses to a single update", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("brew");
    runPmUpdateMock.mockResolvedValueOnce({ id: "swiftly", success: false });
    const res = await new SwiftlyProvider().updateAll([
      { id: "swiftly", current: "1.1.3", latest: "1.2.0" },
    ]);
    expect(res).toEqual([{ id: "swiftly", success: false }]);
    expect(runPmUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("still updates once even if the caller passes several rows", async () => {
    detectInstallSourceMock.mockResolvedValue("brew");
    runPmUpdateMock.mockResolvedValue({ id: "swiftly", success: true });
    const res = await new SwiftlyProvider().updateAll([
      { id: "swiftly", current: "1.1.3", latest: "1.2.0" },
      { id: "swiftly", current: "1.1.3", latest: "1.2.0" },
    ]);
    expect(res).toHaveLength(1);
    expect(runPmUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("SwiftlyProvider.installHint", () => {
  it("points at swift.org per platform and never suggests Windows", () => {
    setPlatform("darwin");
    expect(new SwiftlyProvider().installHint).toContain("install/macos/swiftly");

    setPlatform("linux");
    expect(new SwiftlyProvider().installHint).toContain("install/linux/swiftly");

    for (const platform of ["win32", "freebsd"] as NodeJS.Platform[]) {
      setPlatform(platform);
      const hint = new SwiftlyProvider().installHint;
      expect(hint).toContain("ne cible pas Windows");
      expect(hint).not.toContain("brew install");
    }
  });
});

// ===========================================================================
// pyenv — the POSIX original, mutually exclusive with pyenv-win
// ===========================================================================

/** `pyenv --version` then `pyenv root`, answered by argv rather than by order. */
function pyenvRuns(options: { version?: string; root?: string; rootFails?: boolean }) {
  runMock.mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === "pyenv" && args[0] === "--version") {
      return mkRun(options.version ?? "pyenv 2.8.3");
    }
    if (cmd === "pyenv" && args[0] === "root") {
      if (options.rootFails) return mkRun("", true);
      return mkRun(options.root ?? "/home/u/.pyenv");
    }
    return mkRun("", true);
  });
}

describe("PyenvProvider.isAvailable", () => {
  it("refuses win32 without probing — that `pyenv` belongs to pyenv-win", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("probes `pyenv` on macOS and Linux", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("darwin");
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(true);
    setPlatform("linux");
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("pyenv");
  });

  it("is unavailable when the binary is missing or the probe throws", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(false);

    commandExistsMock.mockRejectedValueOnce(new Error("nope"));
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("pyenv / pyenv-win mutual exclusion", () => {
  it("shows exactly one row's worth of provider per platform", async () => {
    commandExistsMock.mockResolvedValue(true);

    setPlatform("win32");
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(false);
    await expect(new PyenvWinProvider().isAvailable()).resolves.toBe(true);

    commandExistsMock.mockClear();
    setPlatform("darwin");
    await expect(new PyenvWinProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(true);
  });
});

describe("parsePyenvVersion", () => {
  it("reads the plain release line", () => {
    expect(parsePyenvVersion("pyenv 2.8.3")).toEqual({
      raw: "2.8.3",
      release: "2.8.3",
    });
  });

  it("cuts the `git describe` tail off the comparable release", () => {
    expect(parsePyenvVersion("pyenv 2.8.3-12-gabc1234")).toEqual({
      raw: "2.8.3-12-gabc1234",
      release: "2.8.3",
    });
    // A four-hex-digit sha is the shortest upstream `git describe` emits.
    expect(parsePyenvVersion("pyenv 2.8.3-1-gabcd")?.release).toBe("2.8.3");
  });

  it("keeps a genuine pre-release suffix, which is not a git tail", () => {
    expect(parsePyenvVersion("pyenv 2.8.3-rc1")).toEqual({
      raw: "2.8.3-rc1",
      release: "2.8.3-rc1",
    });
  });

  it("tolerates the leading v and any casing", () => {
    expect(parsePyenvVersion("PyEnv v2.8.3")?.raw).toBe("2.8.3");
  });

  it("returns null on blank and garbage input", () => {
    expect(parsePyenvVersion("")).toBeNull();
    expect(parsePyenvVersion("\n\n")).toBeNull();
    expect(parsePyenvVersion("command not found: pyenv")).toBeNull();
    expect(parsePyenvVersion("pyenv unknown")).toBeNull();
  });
});

describe("pyenv compareReleases", () => {
  it("orders numerically, so 2.10 sits above 2.9", () => {
    expect(comparePyenvReleases("2.9.0", "2.10.0")).toBeLessThan(0);
    expect(comparePyenvReleases("2.10.0", "2.9.0")).toBeGreaterThan(0);
  });

  it("reports equality, including across missing trailing segments", () => {
    expect(comparePyenvReleases("2.8.3", "2.8.3")).toBe(0);
    expect(comparePyenvReleases("2.8", "2.8.0")).toBe(0);
    expect(comparePyenvReleases("2.8.0", "2.8")).toBe(0);
    expect(comparePyenvReleases("v2.8.3", "2.8.3")).toBe(0);
  });

  it("pads the shorter side with zeros in either direction", () => {
    expect(comparePyenvReleases("2.8", "2.8.1")).toBeLessThan(0);
    expect(comparePyenvReleases("2.8.1", "2.8")).toBeGreaterThan(0);
  });

  it("returns null — never a guess — when either side is not dotted-numeric", () => {
    expect(comparePyenvReleases("2.8.3-rc1", "2.8.3")).toBeNull();
    expect(comparePyenvReleases("2.8.3", "next")).toBeNull();
    expect(comparePyenvReleases("", "2.8.3")).toBeNull();
    // An empty component is not a number either: "2..3" and a trailing dot
    // must not silently compare as 2.0.3 / 2.8.0.
    expect(comparePyenvReleases("2..3", "2.0.3")).toBeNull();
    expect(comparePyenvReleases("2.8.", "2.8.0")).toBeNull();
    expect(comparePyenvReleases(".", "2.8.3")).toBeNull();
  });

  it("compares a single-segment version against a dotted one", () => {
    expect(comparePyenvReleases("2", "2.0.0")).toBe(0);
    expect(comparePyenvReleases("2", "3")).toBeLessThan(0);
  });
});

describe("PyenvProvider.listOutdated", () => {
  it("asks for `pyenv --version` and returns [] when it fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledWith("pyenv", ["--version"]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when the version line is unrecognised", async () => {
    runMock.mockResolvedValueOnce(mkRun("pyenv: no such command"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("returns [] when GitHub has no answer", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("pyenv/pyenv");
  });

  it("returns [] when the installed release is current or ahead", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.8.3");
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);

    pyenvRuns({ version: "pyenv 2.9.0" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.8.3");
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);

    // No row was built, so nothing probed the checkout or the install source.
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("never reports a development checkout sitting ahead of its tag", async () => {
    pyenvRuns({ version: "pyenv 2.8.3-12-gabc1234" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.8.3");
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("still reports a development checkout that is genuinely behind", async () => {
    pyenvRuns({ version: "pyenv 2.8.3-12-gabc1234" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.9.0");
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");

    const rows = await new PyenvProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "pyenv",
        name: "pyenv",
        current: "2.8.3-12-gabc1234",
        latest: "2.9.0",
        note: "clone git — git pull --ff-only",
      },
    ]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when a fork's scheme makes the comparison unparseable", async () => {
    pyenvRuns({ version: "pyenv 2.8.3-rc1" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.9.0");
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    // "cannot compare" is not "up to date": the lookup happened, the row did
    // not, and nothing was probed on the strength of a guess.
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledTimes(1);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("returns [] when the published side is the unparseable one", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.9.0-rc1");
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("falls back to the owning package manager when the root is not a clone", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.9.0");
    existsSyncMock.mockReturnValue(false);
    detectInstallSourceMock.mockResolvedValueOnce("brew");

    const rows = await new PyenvProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "pyenv",
        name: "pyenv",
        current: "2.8.3",
        latest: "2.9.0",
        note: "via brew",
      },
    ]);
    expect(detectInstallSourceMock).toHaveBeenCalledWith("pyenv");
  });

  it("says so plainly when no source can be identified, without flagging manual", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.9.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");

    const rows = await new PyenvProvider().listOutdated();
    expect(rows[0]).toMatchObject({ note: "source inconnue — mise à jour manuelle" });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("returns [] rather than throwing when the spawn is rejected", async () => {
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when the releases lookup itself rejects", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("returns [] when the install-source probe rejects while building the row", async () => {
    pyenvRuns({});
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.9.0");
    existsSyncMock.mockReturnValue(false);
    detectInstallSourceMock.mockRejectedValueOnce(new Error("boom"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("PyenvProvider git-checkout detection", () => {
  it("fast-forwards the clone when the binary on PATH lives inside the root", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue("/home/u/.pyenv/shims/pyenv");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual({
      id: "pyenv",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "-C",
      "/home/u/.pyenv",
      "pull",
      "--ff-only",
    ]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("keeps the clone answer when PATH resolves to nothing at all", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue(null);
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await expect(new PyenvProvider().update("pyenv")).resolves.toMatchObject({
      success: true,
    });
    expect(resolveBinaryPathMock).not.toHaveBeenCalled();
  });

  it("accepts a shortcut binary once its symlink resolves into the root", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue("/home/u/.local/bin/pyenv");
    resolveBinaryPathMock.mockResolvedValue("/home/u/.pyenv/bin/pyenv");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await expect(new PyenvProvider().update("pyenv")).resolves.toMatchObject({
      success: true,
    });
    expect(resolveBinaryPathMock).toHaveBeenCalledWith("pyenv");
  });

  it("refuses to fast-forward a leftover clone when brew owns the binary", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue("/opt/homebrew/bin/pyenv");
    resolveBinaryPathMock.mockResolvedValue(
      "/opt/homebrew/Cellar/pyenv/2.8.3/bin/pyenv",
    );
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("refuses the clone when the PATH hit cannot be resolved either", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue("/usr/bin/pyenv");
    resolveBinaryPathMock.mockResolvedValue(null);
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("does not mistake a sibling directory sharing the root's prefix", async () => {
    // `/home/u/.pyenv-old/...` starts with `/home/u/.pyenv` as a raw string.
    // Containment is tested on the separator precisely so this cannot pass.
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue("/home/u/.pyenv-old/bin/pyenv");
    resolveBinaryPathMock.mockResolvedValue("/home/u/.pyenv-old/bin/pyenv");
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("does not accept the root directory itself as the binary", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockResolvedValue("/home/u/.pyenv");
    resolveBinaryPathMock.mockResolvedValue("/home/u/.pyenv");
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("keeps only the first line of a chatty `pyenv root`, trimmed", async () => {
    pyenvRuns({ root: "  /data/pyenv  \r\nwarning: PYENV_ROOT has a trailing slash" });
    existsSyncMock.mockImplementation((p: string) => p === "/data/pyenv/.git");
    whichFirstMock.mockResolvedValue("/data/pyenv/bin/pyenv");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "-C",
      "/data/pyenv",
      "pull",
      "--ff-only",
    ]);
  });

  it("ignores a whitespace-only $PYENV_ROOT instead of using it as a path", async () => {
    pyenvRuns({ rootFails: true });
    process.env["PYENV_ROOT"] = "   ";
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "-C",
      "/home/u/.pyenv",
      "pull",
      "--ff-only",
    ]);
    expect(existsSyncMock).not.toHaveBeenCalledWith("   /.git");
  });

  it("degrades to delegation when the PATH lookup rejects", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    whichFirstMock.mockRejectedValue(new Error("PATH exploded"));
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual({
      id: "pyenv",
      success: true,
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("degrades to delegation when the .git probe itself throws", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual({
      id: "pyenv",
      success: true,
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("matches containment on the separator when the root already ends in one", async () => {
    pyenvRuns({ root: "/data/pyenv/" });
    existsSyncMock.mockImplementation((p: string) => p === "/data/pyenv/.git");
    whichFirstMock.mockResolvedValue("/data/pyenv/bin/pyenv");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "-C",
      "/data/pyenv/",
      "pull",
      "--ff-only",
    ]);
  });

  it("falls back to $PYENV_ROOT when the binary refuses to answer", async () => {
    pyenvRuns({ rootFails: true });
    process.env["PYENV_ROOT"] = "/data/pyenv";
    existsSyncMock.mockImplementation((p: string) => p === "/data/pyenv/.git");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "-C",
      "/data/pyenv",
      "pull",
      "--ff-only",
    ]);
  });

  it("rejects a relative answer from either source and lands on ~/.pyenv", async () => {
    pyenvRuns({ root: "relative/pyenv" });
    process.env["PYENV_ROOT"] = "also/relative";
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    await new PyenvProvider().update("pyenv");
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "-C",
      "/home/u/.pyenv",
      "pull",
      "--ff-only",
    ]);
  });

  it("gives up on the clone when no home directory can be resolved", async () => {
    pyenvRuns({ rootFails: true });
    homedirMock.mockImplementation(() => {
      throw new Error("no home");
    });
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("gives up on the clone when the home directory is not absolute", async () => {
    pyenvRuns({ rootFails: true });
    homedirMock.mockReturnValue("");
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("degrades to delegation when the root probe itself throws", async () => {
    runMock.mockRejectedValue(new Error("spawn failed"));
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual({
      id: "pyenv",
      success: true,
    });
  });
});

describe("PyenvProvider.update", () => {
  it("delegates to brew/apt — never to `pyenv update`, which is a plugin", async () => {
    pyenvRuns({});
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: true });

    await new PyenvProvider().update("pyenv");
    const call = delegateUpdateMock.mock.calls[0]![0];
    expect(call).toMatchObject({
      id: "pyenv",
      binary: "pyenv",
      packageIds: { brew: "pyenv", apt: "pyenv" },
    });
    expect(Object.keys(call.packageIds).sort()).toEqual(["apt", "brew"]);
    expect(call.manualMessage).toContain("pyenv.run");
    expect(runInheritMock).not.toHaveBeenCalledWith("pyenv", ["update"]);
  });

  it("reports the diverged-checkout cause when the fast-forward is refused", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));

    const res = await new PyenvProvider().update("pyenv");
    expect(res).toMatchObject({ id: "pyenv", success: false });
    expect(res.message).toContain("/home/u/.pyenv");
    expect(res.message).toMatch(/ff-only/);
  });

  it("reports a missing git rather than throwing", async () => {
    pyenvRuns({});
    existsSyncMock.mockImplementation((p: string) => p === "/home/u/.pyenv/.git");
    runInheritMock.mockRejectedValueOnce(new Error("ENOENT git"));

    const res = await new PyenvProvider().update("pyenv");
    expect(res).toMatchObject({ id: "pyenv", success: false });
    expect(res.message).toContain("Impossible de lancer git");
  });

  it("fails soft with the manual message when the delegation throws", async () => {
    pyenvRuns({});
    delegateUpdateMock.mockRejectedValueOnce(new Error("boom"));

    const res = await new PyenvProvider().update("pyenv");
    expect(res).toMatchObject({ id: "pyenv", success: false });
    expect(res.message).toContain("pyenv.run");
  });
});

describe("PyenvProvider.updateAll", () => {
  it("does nothing at all for an empty set", async () => {
    await expect(new PyenvProvider().updateAll([])).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("collapses to a single update", async () => {
    pyenvRuns({});
    delegateUpdateMock.mockResolvedValueOnce({ id: "pyenv", success: false });
    const res = await new PyenvProvider().updateAll([
      { id: "pyenv", current: "2.8.3", latest: "2.9.0" },
    ]);
    expect(res).toEqual([{ id: "pyenv", success: false }]);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("still updates once even if the caller passes several rows", async () => {
    pyenvRuns({});
    delegateUpdateMock.mockResolvedValue({ id: "pyenv", success: true });
    const res = await new PyenvProvider().updateAll([
      { id: "pyenv", current: "2.8.3", latest: "2.9.0" },
      { id: "pyenv", current: "2.8.3", latest: "2.9.0" },
    ]);
    expect(res).toHaveLength(1);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("PyenvProvider.installHint", () => {
  it("sends Windows to pyenv-win and never suggests this project there", () => {
    setPlatform("win32");
    const hint = new PyenvProvider().installHint;
    expect(hint).toContain("pyenv-win");
    expect(hint).not.toContain("pyenv.run");

    setPlatform("darwin");
    expect(new PyenvProvider().installHint).toBe("brew install pyenv");

    setPlatform("linux");
    expect(new PyenvProvider().installHint).toContain("pyenv.run");

    setPlatform("freebsd");
    expect(new PyenvProvider().installHint).toContain("pyenv.run");
  });
});

// ===========================================================================
// nvm — a sourced shell function, mutually exclusive with nvm-windows
// ===========================================================================

/** Make `<dir>/nvm.sh` (and optionally `<dir>/.git`) the only things on disk. */
function nvmOnDisk(dir: string, options: { git?: boolean } = {}): void {
  existsSyncMock.mockImplementation((p: string) => {
    if (p === `${dir}/nvm.sh`) return true;
    if (p === `${dir}/.git`) return options.git === true;
    return false;
  });
}

/** The bash child that sources nvm.sh, answered by command rather than order. */
function nvmVersionRun(stdout: string, failed = false): void {
  runMock.mockImplementation(async (cmd: string) =>
    cmd === "bash" ? mkRun(stdout, failed) : mkRun("", true),
  );
}

describe("NvmProvider.isAvailable", () => {
  it("refuses win32 without touching the disk or PATH", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    nvmOnDisk("/home/u/.nvm");

    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("does not look for bash when nvm.sh is nowhere to be found", async () => {
    setPlatform("linux");
    existsSyncMock.mockReturnValue(false);
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("needs both nvm.sh and bash", async () => {
    setPlatform("darwin");
    nvmOnDisk("/home/u/.nvm");

    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("bash");

    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable rather than throwing when the bash probe blows up", async () => {
    setPlatform("linux");
    nvmOnDisk("/home/u/.nvm");
    commandExistsMock.mockRejectedValueOnce(new Error("nope"));
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
  });

  it("honours $NVM_DIR first, then $XDG_CONFIG_HOME, then ~/.nvm", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValue(true);

    process.env["NVM_DIR"] = "/opt/nvm";
    nvmOnDisk("/opt/nvm");
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/opt/nvm/nvm.sh");

    delete process.env["NVM_DIR"];
    process.env["XDG_CONFIG_HOME"] = "/cfg";
    nvmOnDisk("/cfg/nvm");
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/cfg/nvm/nvm.sh");

    delete process.env["XDG_CONFIG_HOME"];
    nvmOnDisk("/home/u/.nvm");
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/home/u/.nvm/nvm.sh");
  });

  it("skips the home candidate when the OS cannot resolve one", async () => {
    setPlatform("linux");
    homedirMock.mockImplementation(() => {
      throw new Error("no home");
    });
    existsSyncMock.mockReturnValue(false);

    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("ignores whitespace-only env vars rather than probing bogus paths", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValue(true);
    process.env["NVM_DIR"] = "   ";
    process.env["XDG_CONFIG_HOME"] = "\t";
    nvmOnDisk("/home/u/.nvm");

    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledTimes(1);
    expect(existsSyncMock).toHaveBeenCalledWith("/home/u/.nvm/nvm.sh");
  });

  it("walks past a candidate that holds no nvm.sh", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValue(true);
    process.env["NVM_DIR"] = "/opt/nvm";
    process.env["XDG_CONFIG_HOME"] = "/cfg";
    nvmOnDisk("/cfg/nvm");

    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock.mock.calls.map(([p]) => p)).toEqual([
      "/opt/nvm/nvm.sh",
      "/cfg/nvm/nvm.sh",
    ]);
  });
});

describe("nvm / nvm-windows mutual exclusion", () => {
  it("shows exactly one row's worth of provider per platform", async () => {
    commandExistsMock.mockResolvedValue(true);
    nvmOnDisk("/home/u/.nvm");
    runMock.mockResolvedValue(mkRun("1.1.12"));

    setPlatform("win32");
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(true);

    commandExistsMock.mockClear();
    setPlatform("linux");
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
  });
});

describe("parseNvmVersion", () => {
  it("reads the bare number `nvm --version` echoes", () => {
    expect(parseNvmVersion("0.40.6")).toBe("0.40.6");
    expect(parseNvmVersion("v0.40.6")).toBe("0.40.6");
  });

  it("scans from the end so a sourcing warning cannot be mistaken for it", () => {
    const stdout = "nvm: $NVM_DIR should not have a trailing slash\n0.40.6\n";
    expect(parseNvmVersion(stdout)).toBe("0.40.6");
  });

  it("walks back past trailing noise that is not a version", () => {
    expect(parseNvmVersion("0.40.6\nDone.\n")).toBe("0.40.6");
  });

  it("returns null on blank and garbage input", () => {
    expect(parseNvmVersion("")).toBeNull();
    expect(parseNvmVersion("   \n\n\t")).toBeNull();
    expect(parseNvmVersion("bash: nvm: command not found")).toBeNull();
  });

  it("handles CRLF output and refuses a line carrying extra text", () => {
    expect(parseNvmVersion("nvm: warning\r\n0.40.6\r\n")).toBe("0.40.6");
    expect(parseNvmVersion("nvm version 0.40.6")).toBeNull();
  });
});

describe("nvm compareReleases", () => {
  it("orders numerically, so 0.10 sits above 0.9", () => {
    expect(compareNvmReleases("0.9.0", "0.10.0")).toBeLessThan(0);
    expect(compareNvmReleases("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });

  it("reports equality, including across missing trailing segments", () => {
    expect(compareNvmReleases("0.40.6", "0.40.6")).toBe(0);
    expect(compareNvmReleases("0.40", "0.40.0")).toBe(0);
    expect(compareNvmReleases("0.40.0", "0.40")).toBe(0);
    expect(compareNvmReleases("v0.40.6", "0.40.6")).toBe(0);
  });

  it("pads the shorter side with zeros in either direction", () => {
    expect(compareNvmReleases("0.40", "0.40.1")).toBeLessThan(0);
    expect(compareNvmReleases("0.40.1", "0.40")).toBeGreaterThan(0);
  });

  it("returns null — never a guess — when either side is not dotted-numeric", () => {
    expect(compareNvmReleases("0.40.6-beta", "0.40.6")).toBeNull();
    expect(compareNvmReleases("0.40.6", "nightly")).toBeNull();
    expect(compareNvmReleases("", "0.40.6")).toBeNull();
  });
});

describe("NvmProvider.listOutdated", () => {
  it("returns [] when no nvm.sh is on disk, without spawning anything", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("reads the version by sourcing nvm.sh in a bash child", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    nvmVersionRun("0.40.5");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");

    await new NvmProvider().listOutdated();

    const call = runMock.mock.calls.find(([cmd]) => cmd === "bash");
    expect(call).toBeDefined();
    const [, args, options] = call as [string, string[], { env: NodeJS.ProcessEnv }];
    expect(args[0]).toBe("-c");
    expect(args[1]).toContain('. "$GUP_NVM_DIR/nvm.sh" --no-use');
    expect(args[1]).toContain("nvm --version");
    // The directory travels through the environment, never spliced into the
    // script body, and NVM_DIR is pinned to the directory actually resolved.
    expect(args[1]).not.toContain("/home/u/.nvm");
    expect(options.env).toMatchObject({
      GUP_NVM_DIR: "/home/u/.nvm",
      NVM_DIR: "/home/u/.nvm",
    });
  });

  it("returns [] when the bash child fails or prints nothing usable", async () => {
    nvmOnDisk("/home/u/.nvm");
    nvmVersionRun("", true);
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();

    nvmVersionRun("bash: nvm: command not found");
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("asks GitHub for the raw tag and returns [] when there is none", async () => {
    nvmOnDisk("/home/u/.nvm");
    nvmVersionRun("0.40.5");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);

    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("nvm-sh/nvm", {
      stripVPrefix: false,
    });
  });

  it("returns [] when the tag normalizes to nothing", async () => {
    nvmOnDisk("/home/u/.nvm");
    nvmVersionRun("0.40.5");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v");
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    // A tag we cannot turn into a version is never handed to a checkout.
    expect(existsSyncMock).not.toHaveBeenCalledWith("/home/u/.nvm/.git");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("returns [] when the checkout is current or ahead of the releases feed", async () => {
    nvmOnDisk("/home/u/.nvm");
    nvmVersionRun("0.40.6");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);

    nvmVersionRun("0.41.0");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);

    // No row built means the `.git` question was never even asked.
    expect(existsSyncMock).not.toHaveBeenCalledWith("/home/u/.nvm/.git");
  });

  it("returns [] when the installed version is not dotted-numeric", async () => {
    nvmOnDisk("/home/u/.nvm");
    nvmVersionRun("0.40.6-beta");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.41.0");
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(existsSyncMock).not.toHaveBeenCalledWith("/home/u/.nvm/.git");
  });

  it("returns [] when the releases lookup itself rejects", async () => {
    nvmOnDisk("/home/u/.nvm");
    nvmVersionRun("0.40.5");
    fetchGitHubReleaseLatestMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("returns [] when the nvm.sh probe itself throws", async () => {
    existsSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("emits a git-checkout row when behind, with the v stripped for display", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    nvmVersionRun("0.40.5");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");

    await expect(new NvmProvider().listOutdated()).resolves.toEqual([
      {
        id: "nvm",
        name: "nvm",
        current: "0.40.5",
        latest: "0.40.6",
        note: "dépôt git — checkout du tag",
      },
    ]);
  });

  it("keeps a non-git install visible, flagged as manual work but not `manual: true`", async () => {
    nvmOnDisk("/home/u/.nvm", { git: false });
    nvmVersionRun("0.40.5");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");

    const rows = await new NvmProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      note: "installation non-git — mise à jour manuelle",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("returns [] rather than throwing when the bash child is rejected", async () => {
    nvmOnDisk("/home/u/.nvm");
    runMock.mockRejectedValue(new Error("EAGAIN"));
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("NvmProvider.update", () => {
  it("fails when no nvm install can be located", async () => {
    existsSyncMock.mockReturnValue(false);
    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.skipped).toBeUndefined();
    expect(res.message).toContain("NVM_DIR");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips a non-git install with a pointer upstream, and never curl-pipes", async () => {
    nvmOnDisk("/home/u/.nvm", { git: false });

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false, skipped: true });
    expect(res.message).toContain(
      "https://github.com/nvm-sh/nvm#installing-and-updating",
    );
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("fails when git is missing", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(false);

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain("git est introuvable");
    expect(commandExistsMock).toHaveBeenCalledWith("git");
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("fails when the releases feed is unreachable", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain("API GitHub");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips instead of checking out an older tag over a newer checkout", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.41.0");

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false, skipped: true });
    expect(res.message).toContain("0.40.6");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips when the checkout already sits on the published tag", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.40.6");

    await expect(new NvmProvider().update("nvm")).resolves.toMatchObject({
      skipped: true,
    });
  });

  it("fetches the tags then checks out the raw tag GitHub published", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.40.5");
    runInheritMock.mockResolvedValue(mkRun(""));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: true });
    expect(res.message).toContain("v0.40.6");
    expect(runInheritMock).toHaveBeenNthCalledWith(1, "git", [
      "-C",
      "/home/u/.nvm",
      "fetch",
      "--tags",
      "origin",
    ]);
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "git", [
      "-C",
      "/home/u/.nvm",
      "checkout",
      "v0.40.6",
    ]);
    // The README's headline `curl … | bash` recipe is deliberately not run.
    for (const [command, args] of [
      ...runMock.mock.calls,
      ...runInheritMock.mock.calls,
    ] as [string, string[]][]) {
      expect(command).not.toBe("curl");
      expect((args ?? []).join(" ")).not.toContain("curl");
    }
  });

  it("proceeds when the installed version cannot be read at all", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("", true);
    runInheritMock.mockResolvedValue(mkRun(""));

    await expect(new NvmProvider().update("nvm")).resolves.toMatchObject({
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledTimes(2);
  });

  it("proceeds when the installed version is not comparable", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.40.5-beta");
    runInheritMock.mockResolvedValue(mkRun(""));

    await expect(new NvmProvider().update("nvm")).resolves.toMatchObject({
      success: true,
    });
  });

  it("reports a failed fetch and never reaches the checkout", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.40.5");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain("git fetch --tags origin");
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("reports a failed checkout, pointing at local modifications", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.40.5");
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain("git checkout v0.40.6");
  });

  it("fails soft when the bash child is rejected mid-update", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    runMock.mockRejectedValue(new Error("EAGAIN"));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain(
      "https://github.com/nvm-sh/nvm#installing-and-updating",
    );
    expect(res.skipped).toBeUndefined();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("fails soft when the git probe is rejected", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockRejectedValueOnce(new Error("PATH exploded"));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain(
      "https://github.com/nvm-sh/nvm#installing-and-updating",
    );
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("fails soft when the releases lookup is rejected", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockRejectedValueOnce(new Error("ENOTFOUND"));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("fails soft when the nvm.sh probe throws instead of answering", async () => {
    existsSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain(
      "https://github.com/nvm-sh/nvm#installing-and-updating",
    );
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("fails soft when the checkout spawn is rejected outright", async () => {
    nvmOnDisk("/home/u/.nvm", { git: true });
    commandExistsMock.mockResolvedValueOnce(true);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v0.40.6");
    nvmVersionRun("0.40.5");
    runInheritMock.mockRejectedValueOnce(new Error("ENOENT git"));

    const res = await new NvmProvider().update("nvm");
    expect(res).toMatchObject({ id: "nvm", success: false });
    expect(res.message).toContain(
      "https://github.com/nvm-sh/nvm#installing-and-updating",
    );
  });
});

describe("NvmProvider.updateAll", () => {
  it("does nothing at all for an empty set", async () => {
    await expect(new NvmProvider().updateAll([])).resolves.toEqual([]);
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("collapses to a single update", async () => {
    nvmOnDisk("/home/u/.nvm", { git: false });
    const res = await new NvmProvider().updateAll([
      { id: "nvm", current: "0.40.5", latest: "0.40.6" },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: "nvm", skipped: true });
  });

  it("still updates once even if the caller passes several rows", async () => {
    nvmOnDisk("/home/u/.nvm", { git: false });
    const res = await new NvmProvider().updateAll([
      { id: "nvm", current: "0.40.5", latest: "0.40.6" },
      { id: "nvm", current: "0.40.5", latest: "0.40.6" },
      { id: "nvm", current: "0.40.5", latest: "0.40.6" },
    ]);
    expect(res).toHaveLength(1);
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("NvmProvider.installHint", () => {
  it("sends Windows to nvm-windows and everyone else to the README", () => {
    setPlatform("win32");
    const hint = new NvmProvider().installHint;
    expect(hint).toContain("nvm-windows");
    expect(hint).not.toContain("nvm-sh/nvm#installing");

    for (const platform of ["darwin", "linux", "freebsd"] as NodeJS.Platform[]) {
      setPlatform(platform);
      expect(new NvmProvider().installHint).toBe(
        "https://github.com/nvm-sh/nvm#installing-and-updating",
      );
    }
  });

  it("is declared slow — it sources a shell and calls GitHub", () => {
    expect(new NvmProvider().slow).toBe(true);
  });
});
