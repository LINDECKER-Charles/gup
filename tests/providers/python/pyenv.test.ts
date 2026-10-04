import * as fs from "node:fs";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  compareReleases,
  parsePyenvVersion,
  PyenvProvider,
} from "../../../src/providers/python/pyenv.js";
import { installedVia } from "../../support/contract/installers.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SystemSpec } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  PYENV_BREW_MACHINE,
  PYENV_MANUAL_MESSAGE,
  PYENV_RELEASE,
  PYENV_ROOT_ARGV,
  PYENV_VERSION_ARGV,
  pullArgv,
  pyenvAnswers,
  pyenvCloneMachine,
} from "./python.cases.js";

/**
 * pyenv, the POSIX original (pyenv-win is another project behind the opposite
 * platform gate): the binary only, compared numerically on its release, and
 * upgraded with `git pull --ff-only` only when the pyenv on PATH really is
 * the clone — never by fast-forwarding a leftover checkout next to a Homebrew
 * install.
 */

const HOME_ROOT = "/home/u/.pyenv";

const PULLED = { id: "pyenv", success: true };

/** The clone machine with `pyenv root` answering `root`. */
function cloneRootedAt(root: string, git = `${root.replace(/\/$/, "")}/.git`): SystemSpec {
  return pyenvCloneMachine("2.8.3", {
    commands: pyenvAnswers("2.8.3", { stdout: root }),
    fs: { [git]: { kind: "dir" } },
  });
}

/** A clone in ~/.pyenv whose `pyenv root` refuses to answer, with `env` set. */
function cloneWithoutRootAnswer(env: Record<string, string> = {}): SystemSpec {
  return pyenvCloneMachine("2.8.3", {
    env,
    commands: pyenvAnswers("2.8.3", { exitCode: 1 }),
  });
}

/** A machine where the pyenv on PATH is `binary`, next to a clone in ~/.pyenv. */
function cloneBesides(binary: string, fsExtra: SystemSpec["fs"] = {}): SystemSpec {
  return pyenvCloneMachine("2.8.3", {
    bin: { pyenv: binary, git: "/usr/bin/git" },
    fs: { [`${HOME_ROOT}/.git`]: { kind: "dir" }, ...fsExtra },
  });
}

describe("PyenvProvider.isAvailable", () => {
  it("probes `pyenv` on macOS too", async () => {
    await system.load(PYENV_BREW_MACHINE);
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(true);
  });

  it("is unavailable rather than throwing when the probe blows up", async () => {
    await system.load(pyenvCloneMachine());
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("nope")));
    await expect(new PyenvProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parsePyenvVersion", () => {
  it("reads the plain release line", () => {
    expect(parsePyenvVersion("pyenv 2.8.3")).toEqual({ raw: "2.8.3", release: "2.8.3" });
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
    expect(compareReleases("2.9.0", "2.10.0")).toBeLessThan(0);
    expect(compareReleases("2.10.0", "2.9.0")).toBeGreaterThan(0);
  });

  it("reports equality, including across missing trailing segments", () => {
    expect(compareReleases("2.8.3", "2.8.3")).toBe(0);
    expect(compareReleases("2.8", "2.8.0")).toBe(0);
    expect(compareReleases("2.8.0", "2.8")).toBe(0);
    expect(compareReleases("v2.8.3", "2.8.3")).toBe(0);
  });

  it("pads the shorter side with zeros in either direction", () => {
    expect(compareReleases("2.8", "2.8.1")).toBeLessThan(0);
    expect(compareReleases("2.8.1", "2.8")).toBeGreaterThan(0);
  });

  it("returns null — never a guess — when either side is not dotted-numeric", () => {
    expect(compareReleases("2.8.3-rc1", "2.8.3")).toBeNull();
    expect(compareReleases("2.8.3", "next")).toBeNull();
    expect(compareReleases("", "2.8.3")).toBeNull();
    // An empty component is not a number either: "2..3" and a trailing dot
    // must not silently compare as 2.0.3 / 2.8.0.
    expect(compareReleases("2..3", "2.0.3")).toBeNull();
    expect(compareReleases("2.8.", "2.8.0")).toBeNull();
    expect(compareReleases(".", "2.8.3")).toBeNull();
  });

  it("compares a single-segment version against a dotted one", () => {
    expect(compareReleases("2", "2.0.0")).toBe(0);
    expect(compareReleases("2", "3")).toBeLessThan(0);
  });
});

describe("PyenvProvider.listOutdated", () => {
  it("asks GitHub nothing, and probes nothing more, on an unrecognised version", async () => {
    await system.load(pyenvCloneMachine("unknown"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
    expect(probeArgvs()).toEqual([PYENV_VERSION_ARGV]);
  });

  it("probes neither the checkout nor the install source when current or ahead", async () => {
    for (const version of ["2.9.0", "2.10.0"]) {
      await system.load(pyenvCloneMachine(version));
      await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
      expect(probeArgvs()).toEqual([PYENV_VERSION_ARGV]);
      expect(system.trace.fsReads).toEqual([]);
    }
  });

  it("still reports a development checkout that is genuinely behind, as printed", async () => {
    await system.load(pyenvCloneMachine("2.8.3-12-gabc1234"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([
      {
        id: "pyenv",
        name: "pyenv",
        current: "2.8.3-12-gabc1234",
        latest: "2.9.0",
        note: "clone git — git pull --ff-only",
      },
    ]);
  });

  it("stays quiet when a fork's scheme makes the comparison unparseable", async () => {
    await system.load(pyenvCloneMachine("2.8.3-rc1"));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    // "cannot compare" is not "up to date": the lookup happened, no probe followed.
    expect(system.trace.requests).toHaveLength(1);
    expect(probeArgvs()).toEqual([PYENV_VERSION_ARGV]);
  });

  it("stays quiet when the published side is the unparseable one", async () => {
    const release = { url: PYENV_RELEASE.url, json: { tag_name: "v2.9.0-rc1" } };
    await system.load(pyenvCloneMachine("2.8.3", { http: [release] }));
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
  });

  it("leaves a distro package to update in place when gup already runs as root", async () => {
    const machine = installedVia("apt", "pyenv", {
      commands: pyenvAnswers("2.8.3", { stdout: HOME_ROOT }),
      http: [PYENV_RELEASE],
    });
    await system.load({ ...machine, elevated: true });
    const [row] = await new PyenvProvider().listOutdated();
    expect(row).toMatchObject({ note: "via apt" });
    expect(row?.requiresAdmin).toBeUndefined();
  });

  it("never flags a source whose upgrade needs no sudo (dnf has no pyenv package)", async () => {
    await system.load(
      installedVia("dnf", "pyenv", {
        commands: pyenvAnswers("2.8.3", { stdout: HOME_ROOT }),
        http: [PYENV_RELEASE],
      }),
    );
    const isElevated = replaceForTest(runner, "isElevated", () => Promise.resolve(false));
    const [row] = await new PyenvProvider().listOutdated();
    expect(row).toMatchObject({ note: "via dnf" });
    expect(row?.requiresAdmin).toBeUndefined();
    expect(isElevated).not.toHaveBeenCalled();
  });

  it("returns [] rather than throwing when the spawn is rejected", async () => {
    await system.load(pyenvCloneMachine());
    system.inject({ on: "spawn", argv: PYENV_VERSION_ARGV, mode: "rejects" });
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("returns [] when the install-source probe rejects while building the row", async () => {
    await system.load(PYENV_BREW_MACHINE);
    system.inject({ on: "spawn", argv: ["which", "pyenv"], mode: "rejects" });
    await expect(new PyenvProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("PyenvProvider git-checkout detection", () => {
  it("keeps the clone answer when PATH resolves to nothing at all", async () => {
    await system.load(cloneBesides("/home/u/.pyenv/bin/pyenv"));
    replaceForTest(runner, "whichFirst", () => Promise.resolve(null));
    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual(PULLED);
    expect(installArgvs()).toEqual([pullArgv(HOME_ROOT)]);
  });

  it("accepts a shortcut binary once its symlink resolves into the root", async () => {
    const shortcut = "/home/u/.local/bin/pyenv";
    await system.load(
      cloneBesides(shortcut, {
        [shortcut]: { kind: "symlink", target: `${HOME_ROOT}/bin/pyenv` },
        [`${HOME_ROOT}/bin/pyenv`]: { kind: "file", executable: true },
      }),
    );
    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual(PULLED);
    expect(installArgvs()).toEqual([pullArgv(HOME_ROOT)]);
  });

  it("refuses to fast-forward a leftover clone when Homebrew owns the binary", async () => {
    await system.load({
      ...PYENV_BREW_MACHINE,
      fs: { "/Users/u/.pyenv/.git": { kind: "dir" } },
    });
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([["brew", "upgrade", "--formula", "pyenv"]]);
  });

  it("refuses the clone when the PATH hit cannot be resolved either", async () => {
    await system.load(cloneBesides("/usr/local/bin/pyenv"));
    system.inject({ on: "spawn", argv: ["which", "pyenv"], mode: "exit-1" });
    await expect(new PyenvProvider().update("pyenv")).resolves.toMatchObject({ skipped: true });
    expect(installArgvs()).toEqual([]);
  });

  it("does not mistake a sibling directory sharing the root's prefix", async () => {
    // `/home/u/.pyenv-old/...` starts with `/home/u/.pyenv` as a raw string.
    await system.load(cloneBesides("/home/u/.pyenv-old/bin/pyenv"));
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([]);
  });

  it("does not accept the root directory itself as the binary", async () => {
    await system.load(cloneBesides(HOME_ROOT, { [HOME_ROOT]: { kind: "dir" } }));
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([]);
  });

  it("keeps only the first line of a chatty `pyenv root`, trimmed", async () => {
    const root = "  /data/pyenv  \r\nwarning: PYENV_ROOT has a trailing slash";
    await system.load({
      ...cloneRootedAt(root, "/data/pyenv/.git"),
      bin: { pyenv: "/data/pyenv/bin/pyenv", git: "/usr/bin/git" },
    });
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([pullArgv("/data/pyenv")]);
  });

  it("matches containment on the separator when the root already ends in one", async () => {
    await system.load({
      ...cloneRootedAt("/data/pyenv/"),
      bin: { pyenv: "/data/pyenv/bin/pyenv", git: "/usr/bin/git" },
    });
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([pullArgv("/data/pyenv/")]);
  });

  it("falls back to $PYENV_ROOT when the binary refuses to answer", async () => {
    await system.load({
      ...cloneWithoutRootAnswer({ PYENV_ROOT: "/data/pyenv" }),
      bin: { pyenv: "/data/pyenv/bin/pyenv", git: "/usr/bin/git" },
      fs: { "/data/pyenv/.git": { kind: "dir" } },
    });
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([pullArgv("/data/pyenv")]);
  });

  it("ignores a whitespace-only $PYENV_ROOT instead of using it as a path", async () => {
    await system.load(cloneWithoutRootAnswer({ PYENV_ROOT: "   " }));
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([pullArgv(HOME_ROOT)]);
    expect(system.trace.fsReads).not.toContain("   /.git");
  });

  it("rejects a relative answer from either source and lands on ~/.pyenv", async () => {
    await system.load(
      pyenvCloneMachine("2.8.3", {
        env: { PYENV_ROOT: "also/relative" },
        commands: pyenvAnswers("2.8.3", { stdout: "relative/pyenv" }),
      }),
    );
    await new PyenvProvider().update("pyenv");
    expect(installArgvs()).toEqual([pullArgv(HOME_ROOT)]);
  });

  it("gives up on the clone when no home directory can be resolved", async () => {
    await system.load(cloneWithoutRootAnswer());
    replaceForTest(os, "homedir", () => {
      throw new Error("no home");
    });
    await new PyenvProvider().update("pyenv");
    expect(system.trace.fsReads).not.toContain(`${HOME_ROOT}/.git`);
    expect(installArgvs()).toEqual([]);
  });

  it("gives up on the clone when the home directory is not absolute", async () => {
    await system.load(cloneWithoutRootAnswer());
    replaceForTest(os, "homedir", () => "");
    await new PyenvProvider().update("pyenv");
    expect(system.trace.fsReads).not.toContain(`${HOME_ROOT}/.git`);
  });

  it("degrades to delegation when the PATH lookup rejects", async () => {
    await system.load(cloneBesides("/home/u/.pyenv/bin/pyenv"));
    replaceForTest(runner, "whichFirst", () => Promise.reject(new Error("PATH exploded")));
    await expect(new PyenvProvider().update("pyenv")).resolves.toMatchObject({ skipped: true });
    expect(installArgvs()).toEqual([]);
  });

  it("degrades to delegation when the .git probe itself throws", async () => {
    await system.load(pyenvCloneMachine());
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EACCES");
    });
    await expect(new PyenvProvider().update("pyenv")).resolves.toMatchObject({ skipped: true });
    expect(installArgvs()).toEqual([]);
  });

  it("degrades to delegation when the root probe itself throws", async () => {
    await system.load({ ...PYENV_BREW_MACHINE, fs: { "/Users/u/.pyenv/.git": { kind: "dir" } } });
    system.inject({ on: "spawn", argv: PYENV_ROOT_ARGV, mode: "rejects" });
    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual(PULLED);
    expect(installArgvs()).toEqual([["brew", "upgrade", "--formula", "pyenv"]]);
  });
});

describe("PyenvProvider.update", () => {
  it("never runs `pyenv update`, which is a plugin", async () => {
    await system.load(pyenvCloneMachine());
    await new PyenvProvider().update("pyenv");
    expect([...probeArgvs(), ...installArgvs()]).not.toContainEqual(["pyenv", "update"]);
  });

  it("reports a missing git rather than throwing", async () => {
    await system.load(pyenvCloneMachine());
    system.inject({ on: "spawn", argv: pullArgv(HOME_ROOT), mode: "rejects" });
    const outcome = await new PyenvProvider().update("pyenv");
    expect(outcome).toMatchObject({ id: "pyenv", success: false });
    expect(outcome.message).toContain("Impossible de lancer git");
  });

  it("fails soft with the manual message when the delegation throws", async () => {
    await system.load(PYENV_BREW_MACHINE);
    system.inject({ on: "spawn", argv: ["which", "pyenv"], mode: "rejects" });
    await expect(new PyenvProvider().update("pyenv")).resolves.toEqual({
      id: "pyenv",
      success: false,
      message: PYENV_MANUAL_MESSAGE,
    });
  });
});

describe("PyenvProvider.installHint", () => {
  it("suggests Homebrew on macOS and the official installer on Linux", async () => {
    await system.load({ platform: "darwin" });
    expect(new PyenvProvider().installHint).toBe("brew install pyenv");
    await system.load({ platform: "linux" });
    expect(new PyenvProvider().installHint).toContain("pyenv.run");
  });
});
