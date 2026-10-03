import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  compareInstalled,
  MintProvider,
  parseMintList,
  toGitHubRepo,
} from "../../../src/providers/lang-other/mint.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest } from "../../support/system/releases.js";
import type { HttpRoute, SystemSpec } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  MINT_LIST_STDOUT,
  MINT_MACHINE,
  MINT_METADATA,
  MINT_METADATA_FILE,
} from "./lang-other.cases.js";

/**
 * Mint: the Swift tools linked into $PATH, their owner recovered from mint's
 * own metadata.json (`mint list` only prints basenames), and upgrades pinned
 * to a resolved tag — a bare `mint install` would read a local Mintfile.
 */

const LEGACY_METADATA_FILE = "/usr/local/lib/mint/metadata.json";
const SWIFTLINT_LATEST = "https://api.github.com/repos/realm/SwiftLint/releases/latest";
const NOTE_UNVERSIONED =
  "réf. git non versionnée (branche ou SHA) : la mise à jour épinglera un tag";

/** The nominal machine with `overrides` merged in. */
function mintMachine(overrides: Partial<SystemSpec>): SystemSpec {
  return { ...MINT_MACHINE, ...overrides };
}

/** `mint list` printing `lines`, metadata.json holding `urls`, releases from `http`. */
function listing(lines: readonly string[], urls: readonly string[], http: HttpRoute[] = []): SystemSpec {
  const packages = Object.fromEntries(urls.map((url) => [url, "cache-dir"]));
  return mintMachine({
    commands: [{ argv: ["mint", "list"], stdout: lines.join("\n") }],
    fs: { [MINT_METADATA_FILE]: { kind: "file", content: JSON.stringify({ packages }) } },
    http,
  });
}

/** Release lookups answering 404: GitHub knows no release for the repo. */
const NO_SWIFTLINT_RELEASE: HttpRoute = { url: SWIFTLINT_LATEST, status: 404, json: {} };

describe("MintProvider.isAvailable", () => {
  it("never probes the binary on Windows — mint has no Windows support", async () => {
    await system.load({ platform: "win32", bin: { mint: "C:\\tools\\mint.exe" } });
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.spawns).toEqual([]);
  });

  it("is false when mint is not on PATH, without running it", async () => {
    await system.load({ platform: "darwin" });
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
    expect(probeArgvs()).toEqual([]);
  });

  it("is false when `mint list` fails", async () => {
    await system.load(mintMachine({ commands: [{ argv: ["mint", "list"], exitCode: 1 }] }));
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
  });

  it("is false for the unrelated mint-lang binary — the banner discriminates", async () => {
    await system.load(
      mintMachine({ commands: [{ argv: ["mint", "list"], stdout: "Mint 0.20.0\nUsage: mint <command>" }] }),
    );
    await expect(new MintProvider().isAvailable()).resolves.toBe(false);
  });

  it("is true on the empty-install banner too", async () => {
    await system.load(
      mintMachine({ commands: [{ argv: ["mint", "list"], stdout: "🌱 No mint packages installed" }] }),
    );
    await expect(new MintProvider().isAvailable()).resolves.toBe(true);
  });

  it("swallows a rejected probe", async () => {
    await system.load(MINT_MACHINE);
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("boom")));
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
      { name: "Tool", gitRepo: "https://github.com/alice/Tool.git", linkedVersion: "1.0.0" },
    ]);
  });

  it("treats the partially-linked rendering `(a *, b)` as linked", () => {
    expect(parseMintList(["  Multi", "    - 3.0.0 (a *, b)"].join("\n"))).toEqual([
      { name: "Multi", linkedVersion: "3.0.0" },
    ]);
  });

  it("leaves an unlinked package without a linkedVersion", () => {
    expect(parseMintList(["  XcodeGen", "    - 2.42.0 (xcodegen)"].join("\n"))).toEqual([
      { name: "XcodeGen" },
    ]);
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
    expect(toGitHubRepo("https://github.com/realm/SwiftLint.git")).toBe("realm/SwiftLint");
    expect(toGitHubRepo("git@github.com:yonaskolb/XcodeGen.git")).toBe("yonaskolb/XcodeGen");
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

describe("MintProvider.listOutdated: tags and refs", () => {
  it("keeps the `v` on the tag — it is handed back to git as a ref", async () => {
    await system.load(mintMachine({ http: [githubLatest("realm/SwiftLint", "v0.60.0"), githubLatest("yonaskolb/XcodeGen", "2.43.0")] }));
    const [row] = await new MintProvider().listOutdated();
    expect(row?.latest).toBe("v0.60.0");
  });

  it("annotates a branch-pinned install instead of silently bumping it", async () => {
    await system.load(
      listing(["  Tool", "    - master (tool) *"], ["https://github.com/alice/Tool.git"], [
        githubLatest("alice/Tool", "1.4.0"),
      ]),
    );
    await expect(new MintProvider().listOutdated()).resolves.toEqual([
      { id: "alice/Tool", name: "alice/Tool", current: "master", latest: "1.4.0", note: NOTE_UNVERSIONED },
    ]);
  });

  it("returns [] rather than throwing when the runner refuses mint", async () => {
    await system.load(MINT_MACHINE);
    system.inject({ on: "spawn", argv: ["mint", "list"], mode: "rejects" });
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
  });

  it("costs no metadata I/O and no request when nothing is linked", async () => {
    await system.load(listing(["  XcodeGen", "    - 2.42.0 (xcodegen)"], []));
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.fsReads).toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});

describe("MintProvider.listOutdated: recovering owners", () => {
  it("drops a package whose owner cannot be recovered, after both default roots", async () => {
    await system.load(mintMachine({ fs: {}, http: [] }));
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.fsReads).toEqual([MINT_METADATA_FILE, LEGACY_METADATA_FILE]);
    expect(system.trace.requests).toEqual([]);
  });

  it("falls back to the legacy /usr/local/lib/mint root", async () => {
    await system.load(
      mintMachine({ fs: { [LEGACY_METADATA_FILE]: { kind: "file", content: MINT_METADATA } } }),
    );
    const rows = await new MintProvider().listOutdated();
    expect(rows.map((row) => row.id)).toEqual(["realm/SwiftLint"]);
  });

  it("drops a non-GitHub package instead of guessing a latest", async () => {
    await system.load(listing(["  Thing", "    - 1.0.0 (thing) *"], ["https://gitlab.com/alice/Thing.git"]));
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops an ambiguous basename rather than picking an owner at random", async () => {
    await system.load(
      listing(["  Tool", "    - 1.0.0 (tool) *"], [
        "https://github.com/alice/Tool.git",
        "https://github.com/bob/tool.git",
      ]),
    );
    await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
  });

  it("uses the git URL from the list line when the basename collides", async () => {
    await system.load(
      listing(
        ["  Tool (https://github.com/bob/Tool.git)", "    - 1.0.0 (tool) *"],
        ["https://github.com/alice/Tool.git", "https://github.com/bob/Tool.git"],
        [githubLatest("bob/Tool", "1.1.0")],
      ),
    );
    const [row] = await new MintProvider().listOutdated();
    expect(row?.id).toBe("bob/Tool");
  });

  it("survives a truncated or oddly-shaped metadata.json", async () => {
    for (const content of ["{ not json", "null", "[]", '{"packages":"nope"}', '{"packages":null}']) {
      await system.load(mintMachine({ fs: { [MINT_METADATA_FILE]: { kind: "file", content } } }));
      await expect(new MintProvider().listOutdated()).resolves.toEqual([]);
    }
  });
});

describe("MintProvider.listOutdated: MINT_PATH", () => {
  it.each([
    ["honours $MINT_PATH, and only that root", "/opt/mintcache", ["/opt/mintcache/metadata.json"]],
    ["expands a literal tilde in $MINT_PATH", "~/mint-cache", ["/Users/u/mint-cache/metadata.json"]],
    ["expands a bare tilde in $MINT_PATH", "~", ["/Users/u/metadata.json"]],
    ["ignores an empty $MINT_PATH and uses the default roots", "", [MINT_METADATA_FILE, LEGACY_METADATA_FILE]],
  ])("%s", async (_title, mintPath, reads) => {
    await system.load(mintMachine({ env: { MINT_PATH: mintPath }, fs: {}, http: [] }));
    await new MintProvider().listOutdated();
    expect(system.trace.fsReads).toEqual(reads);
  });
});

describe("MintProvider updates", () => {
  it("skips rather than run the Mintfile-sensitive bare install", async () => {
    await system.load(mintMachine({ http: [NO_SWIFTLINT_RELEASE] }));
    const outcome = await new MintProvider().update("realm/SwiftLint");
    expect(outcome).toMatchObject({ id: "realm/SwiftLint", success: false, skipped: true });
    expect(outcome.message).toMatch(/mint install realm\/SwiftLint@<tag>/);
    expect(installArgvs()).toEqual([]);
  });

  it("skips too when the lookup fails on the network", async () => {
    await system.load(MINT_MACHINE);
    system.inject({ on: "http", url: SWIFTLINT_LATEST, mode: "network" });
    await expect(new MintProvider().update("realm/SwiftLint")).resolves.toMatchObject({
      success: false,
      skipped: true,
    });
  });

  it("degrades an install the runner refuses to a failed outcome", async () => {
    await system.load(MINT_MACHINE);
    system.answerInstall({ rejects: true });
    await expect(new MintProvider().update("realm/SwiftLint")).resolves.toEqual({
      id: "realm/SwiftLint",
      success: false,
      message: "impossible de lancer mint",
    });
  });

  it("reuses the tag carried by the row — no extra HTTP call", async () => {
    await system.load(MINT_MACHINE);
    const outcomes = await new MintProvider().updateAll([
      { id: "realm/SwiftLint", current: "0.59.1", latest: "0.60.0" },
      { id: "yonaskolb/XcodeGen", current: "2.42.0", latest: "2.43.0" },
    ]);
    expect(system.trace.requests).toEqual([]);
    expect(installArgvs()).toEqual([
      ["mint", "install", "realm/SwiftLint@0.60.0"],
      ["mint", "install", "yonaskolb/XcodeGen@2.43.0"],
    ]);
    expect(outcomes).toEqual([
      { id: "realm/SwiftLint", success: true },
      { id: "yonaskolb/XcodeGen", success: true },
    ]);
  });

  it("falls back to a fresh lookup when the row carries no tag", async () => {
    await system.load(MINT_MACHINE);
    await expect(
      new MintProvider().updateAll([{ id: "realm/SwiftLint", current: "0.59.1", latest: "" }]),
    ).resolves.toEqual([{ id: "realm/SwiftLint", success: true }]);
    expect(system.trace.requests).toEqual([{ method: "GET", url: SWIFTLINT_LATEST }]);
  });
});
