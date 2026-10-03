import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  compareGitForWindowsVersions,
  GitForWindowsProvider,
  parseGitForWindowsVersion,
} from "../../../src/providers/dev-cli/git-for-windows.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  GFW_MANUAL,
  GFW_RELEASE,
  GIT_VERSION_ARGV,
  gitMachine,
  STANDALONE_GIT,
  UPDATER_BANNER,
  UPDATER_PROBE_ARGV,
  UPDATER_RUN_ARGV,
} from "./git-for-windows.cases.js";

/**
 * Git for Windows' knowledge: only a `.windows.N` build is this distribution,
 * its versions order on three axes (upstream, release candidate, patchlevel),
 * and a standalone install is updated by git's own updater, whose exit codes
 * mean more than success or failure.
 */

const provider = () => new GitForWindowsProvider();
const BEHIND = "git version 2.55.0.windows.1";
const WHERE_GIT = ["where", "git"];

/** A standalone Git for Windows that ships its updater. */
const withUpdater = () => gitMachine({ version: BEHIND, updater: { stdout: UPDATER_BANNER } });

describe("GitForWindowsProvider.isAvailable", () => {
  it.each(["darwin", "linux"] as const)("never looks at PATH on %s", async (platform) => {
    await system.load({ platform, bin: { git: "/usr/bin/git" } });
    const lookup = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(lookup).not.toHaveBeenCalled();
    expect(probeArgvs()).toEqual([]);
  });

  it.each([
    "git version 2.47.0",
    "git version 2.51.0.vfs.0.1",
    "git version 2.39.5 (Apple Git-154)",
  ])("is unavailable for another git: %s", async (version) => {
    await system.load(gitMachine({ version }));
    await expect(provider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable without git on PATH, and never runs it", async () => {
    await system.load({ platform: "win32" });
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(probeArgvs()).toEqual([]);
  });

  it("is unavailable, running nothing, when the PATH probe rejects", async () => {
    await system.load(gitMachine({ version: BEHIND }));
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("PATH exploded")));
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(probeArgvs()).toEqual([]);
  });

  it.each(["exit-1", "rejects"] as const)(
    "is unavailable when `git --version` answers %s",
    async (mode) => {
      await system.load(gitMachine({ version: BEHIND }));
      system.inject({ on: "spawn", argv: GIT_VERSION_ARGV, mode });
      await expect(provider().isAvailable()).resolves.toBe(false);
    },
  );
});

describe("parseGitForWindowsVersion", () => {
  it("returns the full tag-shaped token for a Git for Windows build", () => {
    expect(parseGitForWindowsVersion("git version 2.55.0.windows.3")).toBe("2.55.0.windows.3");
    expect(parseGitForWindowsVersion("GIT VERSION 2.47.1.windows.10\n")).toBe(
      "2.47.1.windows.10",
    );
  });

  it("parses both release-candidate separators", () => {
    expect(parseGitForWindowsVersion("git version 2.32.0-rc0.windows.1")).toBe(
      "2.32.0-rc0.windows.1",
    );
    expect(parseGitForWindowsVersion("git version 2.34.0.rc1.windows.1")).toBe(
      "2.34.0.rc1.windows.1",
    );
  });

  it("returns null for every other git that answers to the same name", () => {
    expect(parseGitForWindowsVersion("git version 2.47.0")).toBeNull();
    expect(parseGitForWindowsVersion("git version 2.51.0.vfs.0.1")).toBeNull();
    expect(parseGitForWindowsVersion("git version 2.45.1.windows.1.dirty")).toBeNull();
    expect(parseGitForWindowsVersion("git version .windows.1")).toBeNull();
    expect(parseGitForWindowsVersion("git version x.y.windows.1")).toBeNull();
    expect(parseGitForWindowsVersion("git version 2.55.0.windows.")).toBeNull();
  });

  it("matches the marker case-insensitively and keeps the token verbatim", () => {
    expect(parseGitForWindowsVersion("git version 2.55.0.WINDOWS.3")).toBe("2.55.0.WINDOWS.3");
  });

  it("returns null for blank and garbage input", () => {
    expect(parseGitForWindowsVersion("")).toBeNull();
    expect(parseGitForWindowsVersion("bash: git: command not found")).toBeNull();
    expect(parseGitForWindowsVersion("git version")).toBeNull();
  });
});

describe("compareGitForWindowsVersions", () => {
  it("orders the upstream version numerically, never lexicographically", () => {
    expect(compareGitForWindowsVersions("2.9.0.windows.1", "2.10.0.windows.1")).toBeLessThan(0);
    expect(compareGitForWindowsVersions("2.10.0.windows.1", "2.9.0.windows.1")).toBeGreaterThan(
      0,
    );
  });

  it("orders the patchlevel numerically — .windows.10 after .windows.9", () => {
    expect(compareGitForWindowsVersions("2.55.0.windows.9", "2.55.0.windows.10")).toBeLessThan(0);
  });

  it("treats a missing upstream segment as zero, on either side", () => {
    expect(compareGitForWindowsVersions("2.55.windows.1", "2.55.0.windows.1")).toBe(0);
    expect(compareGitForWindowsVersions("2.55.0.windows.1", "2.55.windows.1")).toBe(0);
    expect(compareGitForWindowsVersions("2.55.windows.1", "2.55.1.windows.1")).toBeLessThan(0);
    expect(compareGitForWindowsVersions("2.55.1.windows.1", "2.55.windows.1")).toBeGreaterThan(0);
  });

  it("ranks a release candidate below the final release of the same core", () => {
    const rc1 = "2.55.0-rc1.windows.1";
    const rc2 = "2.55.0-rc2.windows.1";
    expect(compareGitForWindowsVersions(rc2, "2.55.0.windows.1")).toBeLessThan(0);
    expect(compareGitForWindowsVersions("2.55.0.windows.1", rc2)).toBeGreaterThan(0);
    expect(compareGitForWindowsVersions(rc1, rc2)).toBeLessThan(0);
    expect(compareGitForWindowsVersions(rc2, rc2)).toBe(0);
  });

  it("returns 0 for the same build", () => {
    expect(compareGitForWindowsVersions("2.55.0.windows.3", "2.55.0.windows.3")).toBe(0);
  });

  it("returns null rather than inventing an answer for an unorderable side", () => {
    expect(compareGitForWindowsVersions("2.55.0", "2.55.0.windows.1")).toBeNull();
    expect(compareGitForWindowsVersions("2.55.0.windows.1", "garbage")).toBeNull();
  });
});

describe("GitForWindowsProvider.listOutdated", () => {
  it("probes the updater offline, within 10 s, reading both streams for its banner", async () => {
    // Shouted on stderr: build-extra prints it through `printf` on whichever stream.
    const updater = { stderr: "USAGE: GIT UPDATE-GIT-FOR-WINDOWS [--gui] [--yes]" };
    await system.load(gitMachine({ version: BEHIND, updater }));
    const rows = await provider().listOutdated();
    expect(rows.map((row) => row.note)).toEqual(["via git update-git-for-windows"]);
    const probe = system.trace.spawns.find((spawn) => spawn.argv[1] === "update-git-for-windows");
    expect(probe).toMatchObject({ mode: "run", argv: UPDATER_PROBE_ARGV, timeout: 10_000 });
    // The probe must never be the thing that starts an installer.
    expect(installArgvs()).toEqual([]);
  });

  it("lists nothing, and asks GitHub nothing, for another git", async () => {
    await system.load(gitMachine({ version: "git version 2.47.0" }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists nothing when `git --version` is refused", async () => {
    await system.load(gitMachine({ version: BEHIND }));
    system.inject({ on: "spawn", argv: GIT_VERSION_ARGV, mode: "rejects" });
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists nothing when the releases name an unorderable tag", async () => {
    await system.load({ ...gitMachine({ version: BEHIND }), http: [{ ...GFW_RELEASE, json: { tag_name: "nightly" } }] });
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([GIT_VERSION_ARGV]);
  });

  it("lists nothing rather than throwing when the owner lookup is refused", async () => {
    await system.load(gitMachine({ version: BEHIND }));
    system.inject({ on: "spawn", argv: WHERE_GIT, mode: "rejects" });
    await expect(provider().listOutdated()).resolves.toEqual([]);
  });

  it("reads a refused updater probe as a missing updater", async () => {
    await system.load(withUpdater());
    system.inject({ on: "spawn", argv: UPDATER_PROBE_ARGV, mode: "rejects" });
    const rows = await provider().listOutdated();
    expect(rows.map((row) => row.note)).toEqual(["installeur à relancer manuellement"]);
  });
});

describe("GitForWindowsProvider.update — the built-in updater", () => {
  it("reports exit 2 as the installer started in the background", async () => {
    await system.load(withUpdater());
    system.answerInstall({ exitCode: 2 });
    await expect(provider().update("git-for-windows")).resolves.toEqual({
      id: "git-for-windows",
      success: true,
      message:
        "installeur lancé en arrière-plan — les sessions Git Bash ouvertes ont été fermées",
    });
    expect(installArgvs()).toEqual([UPDATER_RUN_ARGV]);
  });

  it("surfaces any other exit code verbatim", async () => {
    await system.load(withUpdater());
    system.answerInstall({ exitCode: 127 });
    await expect(provider().update("git-for-windows")).resolves.toEqual({
      id: "git-for-windows",
      success: false,
      message: `git update-git-for-windows a échoué (code 127) — ${GFW_MANUAL}`,
    });
  });

  it("degrades to a generic failure when the updater is refused", async () => {
    await system.load(withUpdater());
    system.answerInstall({ rejects: true });
    await expect(provider().update("git-for-windows")).resolves.toEqual({
      id: "git-for-windows",
      success: false,
      message: `échec inattendu de la mise à jour — ${GFW_MANUAL}`,
    });
  });

  it("degrades to a generic failure when the owner lookup is refused", async () => {
    await system.load(gitMachine({ version: BEHIND, binary: STANDALONE_GIT }));
    system.inject({ on: "spawn", argv: WHERE_GIT, mode: "rejects" });
    await expect(provider().update("git-for-windows")).resolves.toMatchObject({
      success: false,
      message: `échec inattendu de la mise à jour — ${GFW_MANUAL}`,
    });
  });
});
