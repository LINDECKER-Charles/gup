import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The four "package gap" providers: Mint (Swift), vcpkg (C/C++), the .NET SDK
 * itself and the standalone NuGet CLI.
 *
 * Everything they touch — process spawns, GitHub releases, mint's metadata.json,
 * `$HOME`, `$MINT_PATH`, `fetch` and the install-source delegation — is mocked
 * here, so the suite is identical on Windows, macOS and Linux CI.
 */

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

const { delegateUpdateMock } = vi.hoisted(() => ({ delegateUpdateMock: vi.fn() }));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: vi.fn(),
  runPmUpdate: vi.fn(),
  describeSource: vi.fn(),
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
      "../../src/core/gh-releases.js",
    );
  return { ...actual, fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock };
});

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));
vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, readFile: readFileMock };
});

const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn(() => "/home/u") }));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: homedirMock };
});

import {
  MintProvider,
  compareInstalled,
  parseMintList,
  toGitHubRepo,
} from "../../src/providers/lang-other/mint.js";
import {
  VcpkgProvider,
  parseVcpkgUpdate,
} from "../../src/providers/lang-other/vcpkg.js";
import {
  DotnetSdkProvider,
  isUpgrade,
  parseDotnetSdks,
  pickHighestSdk,
  sdkChannel,
} from "../../src/providers/dotnet-php/dotnet-sdk.js";
import {
  NugetProvider,
  parseNugetVersion,
  pickLatestStable,
  toVersionTriple,
} from "../../src/providers/dotnet-php/nuget.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

const ORIGINAL_MINT_PATH = process.env["MINT_PATH"];

function setMintPath(value: string | undefined): void {
  if (value === undefined) delete process.env["MINT_PATH"];
  else process.env["MINT_PATH"] = value;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  delegateUpdateMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  readFileMock.mockReset();
  // Default: mint's metadata.json does not exist. Never falls through to real I/O.
  readFileMock.mockRejectedValue(
    Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
  );
  homedirMock.mockReset();
  homedirMock.mockReturnValue("/home/u");
  setMintPath(undefined);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  setMintPath(ORIGINAL_MINT_PATH);
  vi.unstubAllGlobals();
});

// ===========================================================================
// vcpkg
// ===========================================================================

/** Real `vcpkg update` output, preamble + rows + both footers. */
const VCPKG_UPDATE_STDOUT = [
  "Using local portfile versions. To update the local portfiles, use `git pull`.",
  "The following packages differ from their port versions:",
  "        corrade:x64-windows              2020.06#4 -> 2020.06#5",
  "        openal-soft:x64-windows          1.22.2#5 -> 1.23.0",
  "To update these packages and all dependencies, run",
  ".\\vcpkg upgrade",
  "",
].join("\n");

const REBUILD_NOTE = "reconstruction depuis les sources — peut être long";

describe("VcpkgProvider.isAvailable", () => {
  it("is a plain binary probe — no platform gate", async () => {
    commandExistsMock.mockResolvedValue(true);
    for (const platform of ["win32", "darwin", "linux"] as const) {
      setPlatform(platform);
      await expect(new VcpkgProvider().isAvailable()).resolves.toBe(true);
    }
    expect(commandExistsMock).toHaveBeenCalledWith("vcpkg");
  });

  it("is false when vcpkg is absent", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new VcpkgProvider().isAvailable()).resolves.toBe(false);
  });

  it("never throws out of the detection Promise.all", async () => {
    commandExistsMock.mockRejectedValue(new Error("PATH is on fire"));
    await expect(new VcpkgProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseVcpkgUpdate", () => {
  it("keeps only the arrow rows, dropping preamble and both footers", () => {
    expect(parseVcpkgUpdate(VCPKG_UPDATE_STDOUT)).toEqual([
      {
        id: "corrade:x64-windows",
        name: "corrade:x64-windows",
        current: "2020.06#4",
        latest: "2020.06#5",
        note: REBUILD_NOTE,
      },
      {
        id: "openal-soft:x64-windows",
        name: "openal-soft:x64-windows",
        current: "1.22.2#5",
        latest: "1.23.0",
        note: REBUILD_NOTE,
      },
    ]);
  });

  it("drops the header without matching on its (localisable) wording", () => {
    // The header itself carries no arrow, which is the whole trick.
    const headerOnly = [
      "Using local portfile versions. To update the local portfiles, use `git pull`.",
      "The following packages differ from their port versions:",
    ].join("\n");
    expect(parseVcpkgUpdate(headerOnly)).toEqual([]);
  });

  it("returns [] on the nothing-to-do message", () => {
    expect(parseVcpkgUpdate("No packages to update.\n")).toEqual([]);
  });

  it("returns [] on blank and garbage input", () => {
    expect(parseVcpkgUpdate("")).toEqual([]);
    expect(parseVcpkgUpdate("\n\n   \n")).toEqual([]);
    expect(parseVcpkgUpdate("error: something exploded")).toEqual([]);
  });

  it("keeps the triplet qualifier intact — that is the upgrade argument", () => {
    const rows = parseVcpkgUpdate("        zlib:x64-windows    1.2.13 -> 1.3.1");
    expect(rows[0]?.id).toBe("zlib:x64-windows");
    expect(rows[0]?.name).toBe("zlib:x64-windows");
  });

  it("handles CRLF output", () => {
    const rows = parseVcpkgUpdate(
      "The following packages differ from their port versions:\r\n        zlib:arm64-osx    1.2.13 -> 1.3.1\r\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.latest).toBe("1.3.1");
  });

  it("keeps a `version-string` port whose version text contains spaces", () => {
    // vcpkg pads the spec to 32 columns, so the extra spaces belong to the
    // version, not to the separator.
    const rows = parseVcpkgUpdate(
      "        libmariadb:x64-linux             3.1.13 rev 2 -> 3.3.8",
    );
    expect(rows).toEqual([
      {
        id: "libmariadb:x64-linux",
        name: "libmariadb:x64-linux",
        current: "3.1.13 rev 2",
        latest: "3.3.8",
        note: REBUILD_NOTE,
      },
    ]);
  });

  it("rejects a line whose left side is not a name:triplet spec", () => {
    expect(parseVcpkgUpdate("        zlib   1.2.13 -> 1.3.1")).toEqual([]);
    expect(parseVcpkgUpdate("        a:b:c   1.2.13 -> 1.3.1")).toEqual([]);
  });

  it("rejects an arrow row with no version on the left of the spec", () => {
    expect(parseVcpkgUpdate("zlib:x64-windows -> 1.3.1")).toEqual([]);
  });

  it("drops a row whose two versions are identical", () => {
    expect(parseVcpkgUpdate("        zlib:x64-windows    1.3.1 -> 1.3.1")).toEqual([]);
  });
});

describe("VcpkgProvider.listOutdated", () => {
  it("asks vcpkg for the update plan and maps the rows", async () => {
    runMock.mockResolvedValueOnce(mkRun(VCPKG_UPDATE_STDOUT));
    const rows = await new VcpkgProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("vcpkg", ["update"]);
    expect(rows.map((r) => r.id)).toEqual([
      "corrade:x64-windows",
      "openal-soft:x64-windows",
    ]);
  });

  it("returns [] when everything is in sync", async () => {
    runMock.mockResolvedValueOnce(mkRun("No packages to update.\n"));
    await expect(new VcpkgProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when vcpkg exits non-zero (manifest mode)", async () => {
    runMock.mockResolvedValueOnce(mkRun("error: this command does not support manifest mode", true));
    await expect(new VcpkgProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the spawn rejects", async () => {
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(new VcpkgProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("VcpkgProvider.update / updateAll", () => {
  it("upgrades one spec with the mandatory flags", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new VcpkgProvider().update("zlib:x64-windows");
    expect(runInheritMock).toHaveBeenCalledWith("vcpkg", [
      "upgrade",
      "--no-dry-run",
      "--no-keep-going",
      "zlib:x64-windows",
    ]);
    expect(res).toEqual({ id: "zlib:x64-windows", success: true });
  });

  it("reports a failed upgrade without inventing a message", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new VcpkgProvider().update("zlib:x64-windows")).resolves.toEqual({
      id: "zlib:x64-windows",
      success: false,
    });
  });

  it("degrades a rejected spawn to a failed outcome", async () => {
    runInheritMock.mockRejectedValueOnce(new Error("bad argv"));
    const res = await new VcpkgProvider().update("zlib:x64-windows");
    expect(res).toEqual({
      id: "zlib:x64-windows",
      success: false,
      message: "impossible de lancer vcpkg upgrade",
    });
  });

  it("does nothing at all for an empty set", async () => {
    await expect(new VcpkgProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("passes every selected spec to a single upgrade invocation", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new VcpkgProvider().updateAll([
      { id: "zlib:x64-windows", name: "zlib:x64-windows", current: "1", latest: "2" },
      { id: "fmt:x64-windows", name: "fmt:x64-windows", current: "1", latest: "2" },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("vcpkg", [
      "upgrade",
      "--no-dry-run",
      "--no-keep-going",
      "zlib:x64-windows",
      "fmt:x64-windows",
    ]);
    expect(res).toEqual([
      { id: "zlib:x64-windows", success: true },
      { id: "fmt:x64-windows", success: true },
    ]);
  });

  it("propagates a batch failure to every selected spec", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new VcpkgProvider().updateAll([
      { id: "zlib:x64-windows", name: "z", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([{ id: "zlib:x64-windows", success: false }]);
  });

  it("propagates a rejected batch spawn as a failure with a message", async () => {
    runInheritMock.mockRejectedValueOnce(new Error("nope"));
    const res = await new VcpkgProvider().updateAll([
      { id: "zlib:x64-windows", name: "z", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      {
        id: "zlib:x64-windows",
        success: false,
        message: "impossible de lancer vcpkg upgrade",
      },
    ]);
  });
});

// ===========================================================================
// Mint (Swift)
// ===========================================================================

const MINT_LIST_STDOUT = [
  "🌱 Installed mint packages:",
  "  SwiftLint",
  "    - 0.59.1 (swiftlint) *",
  "  XcodeGen",
  "    - 2.42.0 (xcodegen)",
  "    - 2.43.0 (xcodegen) *",
  "",
].join("\n");

const MINT_METADATA = JSON.stringify({
  packages: {
    "https://github.com/realm/SwiftLint.git": "realm_SwiftLint",
    "https://github.com/yonaskolb/XcodeGen.git": "yonaskolb_XcodeGen",
  },
});

const NOTE_UNVERSIONED =
  "réf. git non versionnée (branche ou SHA) : la mise à jour épinglera un tag";

/** Resolve GitHub "latest" per repo, so fan-out order cannot matter. */
function stubReleases(tags: Record<string, string | null>): void {
  fetchGitHubReleaseLatestMock.mockImplementation(async (repo: string) =>
    Object.prototype.hasOwnProperty.call(tags, repo) ? tags[repo] : null,
  );
}

describe("MintProvider.isAvailable", () => {
  it("never probes the binary on Windows — mint has no Windows support", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is false when mint is not on PATH, without running it", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValue(false);
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).toHaveBeenCalledWith("mint");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is false when `mint list` fails", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
  });

  it("is false for the unrelated mint-lang binary — the banner discriminates", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("Mint 0.20.0\nUsage: mint <command>"));
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
  });

  it("is true on the real banner, including the empty-install wording", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("🌱 No mint packages installed"));
    await expect(new MintProvider().isAvailable()).resolves.toBe(true);
    expect(runMock).toHaveBeenCalledWith("mint", ["list"]);

    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    await expect(new MintProvider().isAvailable()).resolves.toBe(true);
  });

  it("swallows a rejected probe", async () => {
    setPlatform("darwin");
    commandExistsMock.mockRejectedValue(new Error("boom"));
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseMintList", () => {
  it("reads the two-level indented tree and the global-link marker", () => {
    expect(parseMintList(MINT_LIST_STDOUT)).toEqual([
      { name: "SwiftLint", linkedVersion: "0.59.1" },
      { name: "XcodeGen", linkedVersion: "2.43.0" },
    ]);
  });

  it("keeps the git URL printed on a basename collision", () => {
    const stdout = [
      "🌱 Installed mint packages:",
      "  Tool (https://github.com/alice/Tool.git)",
      "    - 1.0.0 (tool) *",
    ].join("\n");
    expect(parseMintList(stdout)).toEqual([
      {
        name: "Tool",
        gitRepo: "https://github.com/alice/Tool.git",
        linkedVersion: "1.0.0",
      },
    ]);
  });

  it("treats the partially-linked rendering `(a *, b)` as linked", () => {
    const stdout = ["  Multi", "    - 3.0.0 (a *, b)"].join("\n");
    expect(parseMintList(stdout)).toEqual([
      { name: "Multi", linkedVersion: "3.0.0" },
    ]);
  });

  it("leaves an unlinked package without a linkedVersion", () => {
    const stdout = ["  XcodeGen", "    - 2.42.0 (xcodegen)"].join("\n");
    expect(parseMintList(stdout)).toEqual([{ name: "XcodeGen" }]);
  });

  it("ignores a two-space line whose suffix is not a parenthesised URL", () => {
    expect(parseMintList("  Something else entirely")).toEqual([]);
  });

  it("ignores a version line that precedes any package", () => {
    expect(parseMintList("    - 1.0.0 (x) *")).toEqual([]);
  });

  it("returns [] on the banner alone, on blank input and on garbage", () => {
    expect(parseMintList("🌱 No mint packages installed")).toEqual([]);
    expect(parseMintList("")).toEqual([]);
    expect(parseMintList("\r\n\r\n")).toEqual([]);
    expect(parseMintList("total nonsense")).toEqual([]);
  });
});

describe("compareInstalled", () => {
  it("orders segment-wise, so 1.10 sorts above 1.9", () => {
    expect(compareInstalled("1.9.0", "1.10.0")).toBe("outdated");
    expect(compareInstalled("1.10.0", "1.9.0")).toBe("current");
  });

  it("reports an ordinary bump and refuses a downgrade", () => {
    expect(compareInstalled("0.59.0", "0.59.1")).toBe("outdated");
    expect(compareInstalled("0.59.1", "0.59.1")).toBe("current");
    expect(compareInstalled("0.60.0", "0.59.1")).toBe("current");
  });

  it("ignores the `v` prefix on either side", () => {
    expect(compareInstalled("v0.59.1", "0.59.1")).toBe("current");
    expect(compareInstalled("0.59.1", "v0.60.0")).toBe("outdated");
  });

  it("compares against a shorter tag by zero-padding, in both directions", () => {
    expect(compareInstalled("2.43", "2.43.0")).toBe("current");
    expect(compareInstalled("2.43", "2.43.1")).toBe("outdated");
    expect(compareInstalled("2.43.1", "2.43")).toBe("current");
  });

  it("survives a tag with an empty numeric segment", () => {
    expect(compareInstalled("1.0.", "1.0.1")).toBe("outdated");
  });

  it("ranks a release above every prerelease of the same core", () => {
    expect(compareInstalled("1.0.0-beta.2", "1.0.0")).toBe("outdated");
    expect(compareInstalled("1.0.0", "1.0.0-beta.2")).toBe("current");
    expect(compareInstalled("1.0.0-beta.1", "1.0.0-beta.2")).toBe("outdated");
    expect(compareInstalled("1.0.0-beta.2", "1.0.0-beta.1")).toBe("current");
    expect(compareInstalled("1.0.0-beta.1", "1.0.0-beta.1")).toBe("current");
  });

  it("ignores a non-prerelease tail rather than giving up on the tag", () => {
    expect(compareInstalled("1.0.0+build7", "1.0.1")).toBe("outdated");
  });

  it("calls a branch or SHA unversioned, unless it equals the tag", () => {
    expect(compareInstalled("master", "1.2.0")).toBe("unversioned");
    expect(compareInstalled("1.2.0", "main")).toBe("unversioned");
    expect(compareInstalled("master", "master")).toBe("current");
    expect(compareInstalled("Master", "master")).toBe("current");
  });
});

describe("toGitHubRepo", () => {
  it("accepts every URL shape mint stores", () => {
    expect(toGitHubRepo("https://github.com/realm/SwiftLint.git")).toBe(
      "realm/SwiftLint",
    );
    expect(toGitHubRepo("git@github.com:yonaskolb/XcodeGen.git")).toBe(
      "yonaskolb/XcodeGen",
    );
    expect(toGitHubRepo("https://github.com/nicklockwood/SwiftFormat")).toBe(
      "nicklockwood/SwiftFormat",
    );
    expect(toGitHubRepo("https://github.com/alice/tool/")).toBe("alice/tool");
    expect(toGitHubRepo("HTTPS://GITHUB.COM/Alice/Tool.git")).toBe("Alice/Tool");
    expect(toGitHubRepo("ssh://git@github.com/alice/tool.git")).toBe("alice/tool");
  });

  it("returns null for anything that is not GitHub", () => {
    expect(toGitHubRepo("https://gitlab.com/alice/tool.git")).toBeNull();
    expect(toGitHubRepo("git@git.corp.internal:alice/tool.git")).toBeNull();
    expect(toGitHubRepo("")).toBeNull();
    expect(toGitHubRepo("https://github.com/onlyowner")).toBeNull();
  });

  it("does not treat a host that merely contains github.com as GitHub", () => {
    expect(toGitHubRepo("https://git.corp/mirrors/github.com/alice/tool.git")).toBeNull();
    expect(toGitHubRepo("https://github.com.evil.test/alice/tool.git")).toBeNull();
  });

  it("rejects a slug carrying characters GitHub does not allow", () => {
    expect(toGitHubRepo("https://github.com/alice/tool/../../other")).toBeNull();
    expect(toGitHubRepo("https://github.com/al ice/tool")).toBeNull();
  });
});

describe("MintProvider.listOutdated", () => {
  it("reports only the linked version that is genuinely behind", async () => {
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({
      "realm/SwiftLint": "0.60.0",
      "yonaskolb/XcodeGen": "2.43.0", // already current
    });

    const rows = await new MintProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("mint", ["list"]);
    expect(readFileMock).toHaveBeenCalledWith("/home/u/.mint/metadata.json", "utf8");
    expect(rows).toEqual([
      {
        id: "realm/SwiftLint",
        name: "realm/SwiftLint",
        current: "0.59.1",
        latest: "0.60.0",
      },
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("realm/SwiftLint", {
      stripVPrefix: false,
    });
  });

  it("keeps the `v` on the tag — it is handed back to git as a ref", async () => {
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({ "realm/SwiftLint": "v0.60.0" });
    const rows = await new MintProvider().listOutdated();
    expect(rows[0]?.latest).toBe("v0.60.0");
  });

  it("annotates a branch-pinned install instead of silently bumping it", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(["  Tool", "    - master (tool) *"].join("\n")),
    );
    readFileMock.mockResolvedValue(
      JSON.stringify({ packages: { "https://github.com/alice/Tool.git": "d" } }),
    );
    stubReleases({ "alice/Tool": "1.4.0" });
    const rows = await new MintProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "alice/Tool",
        name: "alice/Tool",
        current: "master",
        latest: "1.4.0",
        note: NOTE_UNVERSIONED,
      },
    ]);
  });

  it("returns [] when the GitHub lookup comes back null", async () => {
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({});
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when a lookup rejects instead of resolving null", async () => {
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    fetchGitHubReleaseLatestMock.mockRejectedValue(new Error("quota"));
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when `mint list` fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns [] rather than throwing when the spawn rejects", async () => {
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
  });

  it("costs no metadata I/O when nothing is linked", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(["  XcodeGen", "    - 2.42.0 (xcodegen)"].join("\n")),
    );
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("drops a package whose owner cannot be recovered", async () => {
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    // metadata.json is missing on both candidate roots (default mock).
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(readFileMock).toHaveBeenNthCalledWith(1, "/home/u/.mint/metadata.json", "utf8");
    expect(readFileMock).toHaveBeenNthCalledWith(
      2,
      "/usr/local/lib/mint/metadata.json",
      "utf8",
    );
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("falls back to the legacy /usr/local/lib/mint root", async () => {
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(MINT_METADATA);
    stubReleases({ "realm/SwiftLint": "0.60.0" });
    const rows = await new MintProvider().listOutdated();
    expect(rows.map((r) => r.id)).toEqual(["realm/SwiftLint"]);
  });

  it("drops a non-GitHub package instead of guessing a latest", async () => {
    runMock.mockResolvedValueOnce(mkRun(["  Thing", "    - 1.0.0 (thing) *"].join("\n")));
    readFileMock.mockResolvedValue(
      JSON.stringify({ packages: { "https://gitlab.com/alice/Thing.git": "d" } }),
    );
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("drops an ambiguous basename rather than picking an owner at random", async () => {
    runMock.mockResolvedValueOnce(mkRun(["  Tool", "    - 1.0.0 (tool) *"].join("\n")));
    readFileMock.mockResolvedValue(
      JSON.stringify({
        packages: {
          "https://github.com/alice/Tool.git": "a",
          "https://github.com/bob/tool.git": "b",
        },
      }),
    );
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
  });

  it("uses the git URL from the list line when the basename collides", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        ["  Tool (https://github.com/bob/Tool.git)", "    - 1.0.0 (tool) *"].join("\n"),
      ),
    );
    readFileMock.mockResolvedValue(
      JSON.stringify({
        packages: {
          "https://github.com/alice/Tool.git": "a",
          "https://github.com/bob/Tool.git": "b",
        },
      }),
    );
    stubReleases({ "bob/Tool": "1.1.0" });
    const rows = await new MintProvider().listOutdated();
    expect(rows[0]?.id).toBe("bob/Tool");
  });

  it("survives a truncated or oddly-shaped metadata.json", async () => {
    for (const payload of ["{ not json", "null", "[]", '{"packages":"nope"}', '{"packages":null}']) {
      runMock.mockReset();
      readFileMock.mockReset();
      runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
      readFileMock.mockResolvedValue(payload);
      await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("honours $MINT_PATH, and only that root", async () => {
    setMintPath("/opt/mintcache");
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({ "realm/SwiftLint": "0.60.0" });
    await new MintProvider().listOutdated();
    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(readFileMock).toHaveBeenCalledWith("/opt/mintcache/metadata.json", "utf8");
  });

  it("expands a literal tilde in $MINT_PATH", async () => {
    setMintPath("~/mint-cache");
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({});
    await new MintProvider().listOutdated();
    expect(readFileMock).toHaveBeenCalledWith("/home/u/mint-cache/metadata.json", "utf8");
  });

  it("expands a bare tilde in $MINT_PATH", async () => {
    setMintPath("~");
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({});
    await new MintProvider().listOutdated();
    expect(readFileMock).toHaveBeenCalledWith("/home/u/metadata.json", "utf8");
  });

  it("ignores an empty $MINT_PATH and uses the default roots", async () => {
    setMintPath("");
    runMock.mockResolvedValueOnce(mkRun(MINT_LIST_STDOUT));
    readFileMock.mockResolvedValue(MINT_METADATA);
    stubReleases({});
    await new MintProvider().listOutdated();
    expect(readFileMock).toHaveBeenCalledWith("/home/u/.mint/metadata.json", "utf8");
  });
});

describe("MintProvider.update / updateAll", () => {
  it("re-resolves the tag and installs it, which re-links globally", async () => {
    stubReleases({ "realm/SwiftLint": "0.60.0" });
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new MintProvider().update("realm/SwiftLint");
    expect(runInheritMock).toHaveBeenCalledWith("mint", [
      "install",
      "realm/SwiftLint@0.60.0",
    ]);
    expect(res).toEqual({ id: "realm/SwiftLint", success: true });
  });

  it("skips rather than run the Mintfile-sensitive bare install", async () => {
    stubReleases({});
    const res = await new MintProvider().update("realm/SwiftLint");
    expect(res).toMatchObject({
      id: "realm/SwiftLint",
      success: false,
      skipped: true,
    });
    expect(res.message).toMatch(/mint install realm\/SwiftLint@<tag>/);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips too when the lookup rejects", async () => {
    fetchGitHubReleaseLatestMock.mockRejectedValueOnce(new Error("offline"));
    const res = await new MintProvider().update("realm/SwiftLint");
    expect(res).toMatchObject({ success: false, skipped: true });
  });

  it("reports a failed build with the exact command in the message", async () => {
    stubReleases({ "realm/SwiftLint": "0.60.0" });
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new MintProvider().update("realm/SwiftLint");
    expect(res).toEqual({
      id: "realm/SwiftLint",
      success: false,
      message: "échec de « mint install realm/SwiftLint@0.60.0 »",
    });
  });

  it("degrades a rejected spawn to a failed outcome", async () => {
    stubReleases({ "realm/SwiftLint": "0.60.0" });
    runInheritMock.mockRejectedValueOnce(new Error("ENOENT"));
    const res = await new MintProvider().update("realm/SwiftLint");
    expect(res).toEqual({
      id: "realm/SwiftLint",
      success: false,
      message: "impossible de lancer mint",
    });
  });

  it("does nothing at all for an empty set", async () => {
    await expect(new MintProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("reuses the tag carried by the row — no extra HTTP call", async () => {
    runInheritMock.mockResolvedValue(mkRun(""));
    const res = await new MintProvider().updateAll([
      {
        id: "realm/SwiftLint",
        name: "realm/SwiftLint",
        current: "0.59.1",
        latest: "0.60.0",
      },
      {
        id: "yonaskolb/XcodeGen",
        name: "yonaskolb/XcodeGen",
        current: "2.42.0",
        latest: "2.43.0",
      },
    ]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    expect(runInheritMock).toHaveBeenNthCalledWith(1, "mint", [
      "install",
      "realm/SwiftLint@0.60.0",
    ]);
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "mint", [
      "install",
      "yonaskolb/XcodeGen@2.43.0",
    ]);
    expect(res).toEqual([
      { id: "realm/SwiftLint", success: true },
      { id: "yonaskolb/XcodeGen", success: true },
    ]);
  });

  it("falls back to a fresh lookup when the row carries no tag", async () => {
    stubReleases({ "realm/SwiftLint": "0.60.0" });
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new MintProvider().updateAll([
      { id: "realm/SwiftLint", name: "realm/SwiftLint", current: "0.59.1", latest: "" },
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("realm/SwiftLint", {
      stripVPrefix: false,
    });
    expect(res).toEqual([{ id: "realm/SwiftLint", success: true }]);
  });
});

// ===========================================================================
// .NET SDK
// ===========================================================================

/** Shape read back off the live releases-index.json. */
function releasesIndex(): unknown {
  return {
    "releases-index": [
      {
        "channel-version": "10.0",
        "latest-release": "10.0.0",
        "latest-sdk": "10.0.100",
        "support-phase": "active",
        "release-type": "sts",
      },
      {
        "channel-version": "9.0",
        "latest-sdk": "9.0.305",
        "support-phase": "eol",
        "release-type": "sts",
      },
      {
        "channel-version": "8.0",
        "latest-sdk": "8.0.414",
        "support-phase": "active",
        "release-type": "lts",
      },
    ],
  };
}

const LIST_SDKS_STDOUT = [
  "8.0.404 [C:\\Program Files\\dotnet\\sdk]",
  "9.0.101 [C:\\Program Files\\dotnet\\sdk]",
  "",
].join("\n");

const DOWNLOAD_PAGE = "https://dotnet.microsoft.com/download";

describe("parseDotnetSdks", () => {
  it("keeps the version and drops the install root", () => {
    expect(parseDotnetSdks(LIST_SDKS_STDOUT)).toEqual(["8.0.404", "9.0.101"]);
    expect(parseDotnetSdks("10.0.100 [/usr/local/share/dotnet/sdk]")).toEqual([
      "10.0.100",
    ]);
  });

  it("keeps a preview band intact", () => {
    expect(
      parseDotnetSdks("10.0.100-preview.6.25358.103 [/usr/share/dotnet/sdk]"),
    ).toEqual(["10.0.100-preview.6.25358.103"]);
  });

  it("drops host warnings and banners by anchoring on the bracket", () => {
    const stdout = [
      "Impossible de trouver le SDK…",
      "DOTNET_ROOT=/usr/share/dotnet",
      "8.0.404 [/usr/share/dotnet/sdk]",
    ].join("\n");
    expect(parseDotnetSdks(stdout)).toEqual(["8.0.404"]);
  });

  it("returns [] on blank and garbage input", () => {
    expect(parseDotnetSdks("")).toEqual([]);
    expect(parseDotnetSdks("\r\n   \r\n")).toEqual([]);
    expect(parseDotnetSdks("no sdks were found")).toEqual([]);
  });
});

describe("pickHighestSdk", () => {
  it("returns null when nothing was parsed", () => {
    expect(pickHighestSdk([])).toBeNull();
  });

  it("picks the highest side-by-side SDK, numerically", () => {
    expect(pickHighestSdk(["8.0.404", "10.0.100", "9.0.101"])).toBe("10.0.100");
    // 8.0.100 must not beat 8.0.99 as a string comparison would.
    expect(pickHighestSdk(["8.0.99", "8.0.100"])).toBe("8.0.100");
  });

  it("ranks a release above every preview of the same core, in either order", () => {
    expect(pickHighestSdk(["10.0.100-preview.6.25358.103", "10.0.100"])).toBe(
      "10.0.100",
    );
    expect(pickHighestSdk(["10.0.100", "10.0.100-preview.6.25358.103"])).toBe(
      "10.0.100",
    );
    expect(
      pickHighestSdk(["10.0.100-preview.5.25277.114", "10.0.100-preview.6.25358.103"]),
    ).toBe("10.0.100-preview.6.25358.103");
  });

  it("treats a missing segment as zero, in either order", () => {
    expect(pickHighestSdk(["8.0.404", "8.0.404.1"])).toBe("8.0.404.1");
    expect(pickHighestSdk(["8.0.404.1", "8.0.404"])).toBe("8.0.404.1");
  });
});

describe("sdkChannel", () => {
  it("keeps major.minor of a full SDK version", () => {
    expect(sdkChannel("8.0.404")).toBe("8.0");
    expect(sdkChannel("10.0.100-preview.6.25358.103")).toBe("10.0");
  });

  it("returns null for anything that is not major.minor.band", () => {
    expect(sdkChannel("8")).toBeNull();
    expect(sdkChannel("8.0")).toBeNull();
    expect(sdkChannel("abc")).toBeNull();
    expect(sdkChannel("")).toBeNull();
  });
});

describe("isUpgrade", () => {
  it("offers a newer band inside the channel", () => {
    expect(isUpgrade("8.0.404", "8.0.414")).toBe(true);
    // 8.0.404 must not read as newer than 8.0.4004.
    expect(isUpgrade("8.0.404", "8.0.4004")).toBe(true);
  });

  it("offers nothing when equal or already ahead", () => {
    expect(isUpgrade("8.0.414", "8.0.414")).toBe(false);
    expect(isUpgrade("8.0.414", "8.0.404")).toBe(false);
  });

  it("never pushes a stable install onto a preview", () => {
    expect(isUpgrade("10.0.100", "10.0.200-preview.1.25000.1")).toBe(false);
  });

  it("keeps a preview user moving — including onto the GA that supersedes it", () => {
    expect(isUpgrade("10.0.100-preview.5.25277.114", "10.0.100-preview.6.25358.103")).toBe(
      true,
    );
    expect(isUpgrade("10.0.100-preview.6.25358.103", "10.0.100")).toBe(true);
  });
});

describe("DotnetSdkProvider.isAvailable", () => {
  it("wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new DotnetSdkProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new DotnetSdkProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).toHaveBeenCalledWith("dotnet");
  });
});

describe("DotnetSdkProvider.listOutdated", () => {
  it("compares inside the installed channel and ignores newer majors", async () => {
    runMock.mockResolvedValueOnce(mkRun(LIST_SDKS_STDOUT));
    fetchMock.mockResolvedValueOnce(jsonResponse(releasesIndex()));
    const rows = await new DotnetSdkProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("dotnet", ["--list-sdks"]);
    // Highest installed is 9.0.101 → channel 9.0, whose latest-sdk is 9.0.305.
    // The 10.0 entry sitting right above it in the index must not win.
    expect(rows).toEqual([
      {
        id: "9.0",
        name: ".NET SDK 9.0",
        current: "9.0.101",
        latest: "9.0.305",
        note: "STS · fin de support",
      },
    ]);
  });

  it("emits no row at all when a newer major exists but the channel is current", async () => {
    runMock.mockResolvedValueOnce(mkRun("10.0.100 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce(jsonResponse(releasesIndex()));
    // 10.0 is current at 10.0.100; nothing in the index may promote it further.
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("labels an LTS channel in active support", async () => {
    runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce(jsonResponse(releasesIndex()));
    const rows = await new DotnetSdkProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "8.0",
        name: ".NET SDK 8.0",
        current: "8.0.404",
        latest: "8.0.414",
        note: "LTS · support actif",
      },
    ]);
  });

  it("omits the note entirely when the index carries no label we know", async () => {
    runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "releases-index": [{ "channel-version": "8.0", "latest-sdk": "8.0.414" }],
      }),
    );
    const rows = await new DotnetSdkProvider().listOutdated();
    expect(rows).toEqual([
      { id: "8.0", name: ".NET SDK 8.0", current: "8.0.404", latest: "8.0.414" },
    ]);
  });

  it("returns [] when dotnet --list-sdks fails, without hitting the network", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when the spawn rejects", async () => {
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when no SDK line parses", async () => {
    runMock.mockResolvedValueOnce(mkRun("No SDKs were found."));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when the installed version has no channel", async () => {
    runMock.mockResolvedValueOnce(mkRun("8 [/usr/share/dotnet/sdk]"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on a non-ok release index", async () => {
    runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the fetch rejects", async () => {
    runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] on a malformed payload rather than throwing", async () => {
    for (const payload of [
      null,
      "<html>captive portal</html>",
      { "releases-index": "nope" },
      {},
    ]) {
      runMock.mockReset();
      fetchMock.mockReset();
      runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));
      await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("returns [] when the JSON body itself is unreadable", async () => {
    runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the installed channel is absent from the index", async () => {
    runMock.mockResolvedValueOnce(mkRun("7.0.404 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce(jsonResponse(releasesIndex()));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when latest-sdk is missing or malformed", async () => {
    for (const entry of [
      { "channel-version": "8.0" },
      { "channel-version": "8.0", "latest-sdk": 8 },
      { "channel-version": "8.0", "latest-sdk": "unknown" },
    ]) {
      runMock.mockReset();
      fetchMock.mockReset();
      runMock.mockResolvedValueOnce(mkRun("8.0.404 [/usr/share/dotnet/sdk]"));
      fetchMock.mockResolvedValueOnce(jsonResponse({ "releases-index": [entry] }));
      await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("never pushes a stable install onto the channel's preview band", async () => {
    runMock.mockResolvedValueOnce(mkRun("10.0.100 [/usr/share/dotnet/sdk]"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "releases-index": [
          {
            "channel-version": "10.0",
            "latest-sdk": "10.0.200-preview.1.25000.1",
            "support-phase": "active",
            "release-type": "sts",
          },
        ],
      }),
    );
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("DotnetSdkProvider.update", () => {
  it("refuses an id that is not a channel", async () => {
    const res = await new DotnetSdkProvider().update("Microsoft.DotNet.SDK.8");
    expect(res).toEqual({
      id: "Microsoft.DotNet.SDK.8",
      success: false,
      message: "Canal .NET non reconnu : Microsoft.DotNet.SDK.8",
    });
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("delegates with channel-scoped ids and the installed brew keg", async () => {
    setPlatform("darwin");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    runMock.mockResolvedValueOnce(mkRun("dotnet@8 8.0.14\n"));
    delegateUpdateMock.mockResolvedValueOnce({ id: "8.0", success: true });

    await expect(new DotnetSdkProvider().update(" 8.0 ")).resolves.toEqual({
      id: "8.0",
      success: true,
    });
    expect(runMock).toHaveBeenCalledWith("brew", ["list", "--versions", "dotnet@8"]);
    expect(delegateUpdateMock).toHaveBeenCalledWith({
      id: "8.0",
      binary: "dotnet",
      packageIds: {
        winget: "Microsoft.DotNet.SDK.8",
        choco: "dotnet-8.0-sdk",
        brew: "dotnet@8",
        apt: "dotnet-sdk-8.0",
        dnf: "dotnet-sdk-8.0",
      },
      manualMessage: `Installateur système : récupérer le SDK 8.0 sur ${DOWNLOAD_PAGE} (Homebrew Cask : brew upgrade --cask dotnet-sdk)`,
    });
  });

  it("falls back to the unversioned brew formula when the keg is absent", async () => {
    setPlatform("darwin");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    runMock.mockResolvedValueOnce(mkRun("", true));
    delegateUpdateMock.mockResolvedValueOnce({ id: "10.0", success: true });
    await new DotnetSdkProvider().update("10.0");
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: expect.objectContaining({ brew: "dotnet" }),
    });
  });

  it("falls back to the unversioned formula on empty brew output", async () => {
    setPlatform("linux");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    runMock.mockResolvedValueOnce(mkRun("   \n"));
    delegateUpdateMock.mockResolvedValueOnce({ id: "8.0", success: true });
    await new DotnetSdkProvider().update("8.0");
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: expect.objectContaining({ brew: "dotnet" }),
    });
  });

  it("falls back to the unversioned formula when brew cannot be spawned", async () => {
    setPlatform("linux");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    runMock.mockRejectedValueOnce(new Error("ENOENT"));
    delegateUpdateMock.mockResolvedValueOnce({ id: "8.0", success: true });
    await new DotnetSdkProvider().update("8.0");
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: expect.objectContaining({ brew: "dotnet" }),
    });
  });

  it("skips the brew probe entirely on Windows", async () => {
    setPlatform("win32");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    delegateUpdateMock.mockResolvedValueOnce({ id: "8.0", success: true });
    await new DotnetSdkProvider().update("8.0");
    expect(runMock).not.toHaveBeenCalled();
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: expect.objectContaining({ brew: "dotnet" }),
    });
  });

  it("names the preview manifests and ships no choco / apt / dnf id", async () => {
    setPlatform("win32");
    fetchMock.mockResolvedValue(
      jsonResponse({
        "releases-index": [
          {
            "channel-version": "11.0",
            "latest-sdk": "11.0.100-preview.1.25000.1",
            "support-phase": "preview",
          },
        ],
      }),
    );
    delegateUpdateMock.mockResolvedValueOnce({ id: "11.0", success: true });
    await new DotnetSdkProvider().update("11.0");
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: { winget: "Microsoft.DotNet.SDK.Preview", brew: "dotnet" },
    });
  });

  it("uses the underscored winget id and the legacy choco id for 3.1", async () => {
    setPlatform("win32");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    delegateUpdateMock.mockResolvedValueOnce({ id: "3.1", success: true });
    await new DotnetSdkProvider().update("3.1");
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: {
        winget: "Microsoft.DotNet.SDK.3_1",
        choco: "dotnetcore-sdk",
        brew: "dotnet",
        apt: "dotnet-sdk-3.1",
        dnf: "dotnet-sdk-3.1",
      },
    });
  });

  it("ships no choco id for a channel chocolatey never published", async () => {
    setPlatform("win32");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    delegateUpdateMock.mockResolvedValueOnce({ id: "3.0", success: true });
    await new DotnetSdkProvider().update("3.0");
    const ids = delegateUpdateMock.mock.calls[0]?.[0].packageIds as Record<string, string>;
    expect(ids).toEqual({
      winget: "Microsoft.DotNet.SDK.3",
      brew: "dotnet",
      apt: "dotnet-sdk-3.0",
      dnf: "dotnet-sdk-3.0",
    });
  });

  it("falls back to the stable naming when the index lookup fails", async () => {
    setPlatform("win32");
    fetchMock.mockRejectedValue(new Error("offline"));
    delegateUpdateMock.mockResolvedValueOnce({ id: "8.0", success: true });
    await new DotnetSdkProvider().update("8.0");
    expect(delegateUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      packageIds: expect.objectContaining({ winget: "Microsoft.DotNet.SDK.8" }),
    });
  });

  it("degrades a throwing delegation to the same SKIP as the manual path", async () => {
    setPlatform("win32");
    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    delegateUpdateMock.mockRejectedValueOnce(new Error("spawn EACCES"));
    const res = await new DotnetSdkProvider().update("8.0");
    expect(res).toMatchObject({ id: "8.0", success: false, skipped: true });
    expect(res.message).toContain(DOWNLOAD_PAGE);
  });

  it("does nothing for an empty set and iterates otherwise", async () => {
    setPlatform("win32");
    await expect(new DotnetSdkProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse(releasesIndex()));
    delegateUpdateMock.mockResolvedValueOnce({ id: "8.0", success: true });
    const res = await new DotnetSdkProvider().updateAll([
      { id: "8.0", name: ".NET SDK 8.0", current: "8.0.404", latest: "8.0.414" },
      { id: "bogus", name: "bogus", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "8.0", success: true },
      {
        id: "bogus",
        success: false,
        message: "Canal .NET non reconnu : bogus",
      },
    ]);
  });
});

// ===========================================================================
// NuGet CLI
// ===========================================================================

const NUGET_HELP_STDOUT = [
  "NuGet Version: 6.11.0.0",
  "usage: NuGet <command> [args] [options]",
  "Type 'NuGet help <command>' for help on a specific command.",
  "",
  "Available commands:",
  "",
  " add          Adds a package to a package source",
  "",
].join("\n");

describe("NugetProvider.isAvailable", () => {
  it("wires through commandExists on every platform", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("linux");
    await expect(new NugetProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("nuget");
    commandExistsMock.mockResolvedValue(false);
    await expect(new NugetProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseNugetVersion", () => {
  it("reads the four-part file version from the English banner", () => {
    expect(parseNugetVersion(NUGET_HELP_STDOUT)).toBe("6.11.0.0");
    expect(parseNugetVersion("NuGet Version: 7.6.0.7")).toBe("7.6.0.7");
  });

  it("tolerates the localized spacing around the colon and a v prefix", () => {
    expect(parseNugetVersion("NuGet Version : 6.11.0.0")).toBe("6.11.0.0");
    expect(parseNugetVersion("NuGet Version: v7.6.0")).toBe("7.6.0");
  });

  it("finds the banner behind a Mono warning line", () => {
    const stdout = [
      "WARNING: The runtime version supported by this application is unavailable.",
      "NuGet Version: 5.11.0.0",
    ].join("\n");
    expect(parseNugetVersion(stdout)).toBe("5.11.0.0");
  });

  it("falls back to the first line when the wording itself is translated", () => {
    expect(parseNugetVersion("NuGet バージョン: 6.11.0.0\nusage: …")).toBe("6.11.0.0");
    expect(parseNugetVersion("\n\n  NuGet, версия: 5.9.1  \n")).toBe("5.9.1");
  });

  it("refuses a first line that is not the assembly banner", () => {
    // The help text documents a `-Version` option; it must stay out of reach.
    expect(parseNugetVersion("Mono JIT compiler version 6.12.0.200\n-Version 1.0.0")).toBeNull();
    expect(parseNugetVersion("usage: nuget <command>")).toBeNull();
  });

  it("returns null on blank input and on a banner carrying no number", () => {
    expect(parseNugetVersion("")).toBeNull();
    expect(parseNugetVersion("\r\n \r\n")).toBeNull();
    expect(parseNugetVersion("NuGet")).toBeNull();
  });
});

describe("toVersionTriple", () => {
  it("normalises a four-part file version against a three-part tag", () => {
    expect(toVersionTriple("7.6.0.7")).toBe("7.6.0");
    expect(toVersionTriple("7.6.0")).toBe("7.6.0");
  });

  it("pads rather than truncates, so 7.6 equals 7.6.0", () => {
    expect(toVersionTriple("7.6")).toBe("7.6.0");
    expect(toVersionTriple("7")).toBe("7.0.0");
  });

  it("strips a leading v and surrounding whitespace", () => {
    expect(toVersionTriple("  v6.11.0.0 ")).toBe("6.11.0");
  });

  it("degrades a non-numeric segment to zero instead of NaN", () => {
    expect(toVersionTriple("abc")).toBe("0.0.0");
    expect(toVersionTriple("6.x.1")).toBe("6.0.1");
    expect(toVersionTriple("")).toBe("0.0.0");
  });
});

describe("pickLatestStable", () => {
  it("picks the numeric maximum, so 6.10.0 beats 6.9.0", () => {
    expect(pickLatestStable(["6.9.0", "6.10.0", "6.4.0"])).toBe("6.10.0");
  });

  it("skips every prerelease shape the feed carries", () => {
    expect(pickLatestStable(["3.4.4-rtm-final", "6.11.0", "7.0.0-preview.1"])).toBe(
      "6.11.0",
    );
  });

  it("returns null when nothing stable is listed", () => {
    expect(pickLatestStable([])).toBeNull();
    expect(pickLatestStable(["1.0.0-rc.1", "2.0.0-beta"])).toBeNull();
  });
});

describe("NugetProvider.listOutdated", () => {
  function feedResponse(versions: unknown, ok = true): Response {
    return jsonResponse({ versions }, ok);
  }

  it("pins the wording, compares triples and emits a row when behind", async () => {
    setPlatform("win32");
    runMock.mockResolvedValueOnce(mkRun(NUGET_HELP_STDOUT));
    fetchMock.mockResolvedValueOnce(
      feedResponse(["6.9.0", "6.12.0", "6.11.0", "7.0.0-preview.1"]),
    );
    const rows = await new NugetProvider().listOutdated();
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith("nuget", ["help", "-ForceEnglishOutput"]);
    expect(rows).toEqual([
      { id: "nuget", name: "NuGet CLI", current: "6.11.0.0", latest: "6.12.0" },
    ]);
  });

  it("marks the Mono caveat off Windows", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("NuGet Version: 5.11.0.0"));
    fetchMock.mockResolvedValueOnce(feedResponse(["6.11.0"]));
    const rows = await new NugetProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      current: "5.11.0.0",
      latest: "6.11.0",
      note: "sous Mono : update -self non garanti",
    });
  });

  it("retries without -ForceEnglishOutput when the option is rejected", async () => {
    setPlatform("win32");
    runMock
      .mockResolvedValueOnce(mkRun("unknown option: -ForceEnglishOutput", true))
      .mockResolvedValueOnce(mkRun("NuGet Version: 3.4.4.1321"));
    fetchMock.mockResolvedValueOnce(feedResponse(["6.11.0"]));
    const rows = await new NugetProvider().listOutdated();
    expect(runMock).toHaveBeenNthCalledWith(1, "nuget", ["help", "-ForceEnglishOutput"]);
    expect(runMock).toHaveBeenNthCalledWith(2, "nuget", ["help"]);
    expect(rows[0]?.current).toBe("3.4.4.1321");
  });

  it("retries when the forced run succeeds but prints nothing parseable", async () => {
    setPlatform("win32");
    runMock
      .mockResolvedValueOnce(mkRun("usage: nuget <command>"))
      .mockResolvedValueOnce(mkRun("NuGet Version: 6.11.0.0"));
    fetchMock.mockResolvedValueOnce(feedResponse(["6.12.0"]));
    const rows = await new NugetProvider().listOutdated();
    expect(runMock).toHaveBeenCalledTimes(2);
    expect(rows[0]?.latest).toBe("6.12.0");
  });

  it("returns [] when neither help invocation yields a version", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when both runs print garbage", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("segfault"))
      .mockResolvedValueOnce(mkRun("segfault"));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on a non-ok feed response", async () => {
    runMock.mockResolvedValueOnce(mkRun("NuGet Version: 6.11.0.0"));
    fetchMock.mockResolvedValueOnce(feedResponse([], false));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the feed request rejects", async () => {
    runMock.mockResolvedValueOnce(mkRun("NuGet Version: 6.11.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] on every malformed payload shape", async () => {
    for (const payload of [
      null,
      "<html>captive portal</html>",
      { error: "nope" },
      { versions: "6.11.0" },
      { versions: [] },
      { versions: [1, 2, 3] },
    ]) {
      runMock.mockReset();
      fetchMock.mockReset();
      runMock.mockResolvedValueOnce(mkRun("NuGet Version: 6.11.0.0"));
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));
      await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("returns [] when the JSON body cannot be read", async () => {
    runMock.mockResolvedValueOnce(mkRun("NuGet Version: 6.11.0.0"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the four-part install matches the three-part tag", async () => {
    runMock.mockResolvedValueOnce(mkRun("NuGet Version: 6.11.0.0"));
    fetchMock.mockResolvedValueOnce(feedResponse(["6.11.0"]));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the install is ahead of the feed", async () => {
    runMock.mockResolvedValueOnce(mkRun("NuGet Version: 6.12.0.0"));
    fetchMock.mockResolvedValueOnce(feedResponse(["6.11.0"]));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("NugetProvider.update / updateAll", () => {
  it("runs the documented self-update, non-interactively", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NugetProvider().update("nuget");
    expect(runInheritMock).toHaveBeenCalledWith("nuget", [
      "update",
      "-self",
      "-NonInteractive",
    ]);
    expect(res).toEqual({ id: "nuget", success: true });
  });

  it("fails with the write-permission cause on Windows", async () => {
    setPlatform("win32");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NugetProvider().update("nuget");
    expect(res).toMatchObject({ id: "nuget", success: false });
    expect(res.skipped).toBeUndefined();
    expect(res.message).toMatch(/administrateur/);
  });

  it("skips with the manual download link under Mono", async () => {
    setPlatform("linux");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NugetProvider().update("nuget");
    expect(res).toMatchObject({ id: "nuget", success: false, skipped: true });
    expect(res.message).toContain(
      "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe",
    );
  });

  it("does nothing at all for an empty set", async () => {
    await expect(new NugetProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("collapses any selection to the single self-update", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NugetProvider().updateAll([
      { id: "nuget", name: "NuGet CLI", current: "6.11.0.0", latest: "6.12.0" },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual([{ id: "nuget", success: true }]);
  });
});
