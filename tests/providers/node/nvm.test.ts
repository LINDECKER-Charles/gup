import * as fs from "node:fs";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import { compareReleases, NvmProvider, parseNvmVersion } from "../../../src/providers/node/nvm.js";
import { NvmWindowsProvider } from "../../../src/providers/node/nvm-windows.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  NVM_HOME,
  NVM_RELEASE,
  NVM_VERSION_ARGV,
  type NvmInstall,
  nvmMachine,
  nvmUpgradeArgvs,
} from "./node.cases.js";

/**
 * nvm, the POSIX Node version manager: a sourced shell function, found
 * through nvm.sh on disk rather than PATH, and upgraded only by checking out
 * the published tag in a clone — never by piping the install script to
 * bash, and never onto a tag older than what is installed.
 */

const INSTALL_DOC = "https://github.com/nvm-sh/nvm#installing-and-updating";
const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";

/** The clone, behind the release unless `install` says otherwise. */
async function loadNvm(install: Partial<NvmInstall> = {}): Promise<void> {
  await system.load(nvmMachine({ version: "0.40.5", ...install }));
}

/** The nvm.sh reads of a detection or a scan, in order. */
function nvmShReads(): string[] {
  return system.trace.fsReads.filter((path) => path.endsWith("/nvm.sh"));
}

describe("NvmProvider.isAvailable", () => {
  it("refuses win32 without touching the disk or PATH", async () => {
    await system.load({ platform: "win32", bin: { bash: GIT_BASH } });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it("does not look for bash when nvm.sh is nowhere to be found", async () => {
    await system.load({ platform: "linux", bin: { bash: "/bin/bash" } });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("needs bash next to nvm.sh", async () => {
    await system.load({ ...nvmMachine({ version: "0.40.5" }), bin: {} });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable rather than throwing when the bash probe blows up", async () => {
    await loadNvm();
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("nope")));
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
  });

  it("honours $NVM_DIR first, then $XDG_CONFIG_HOME, then ~/.nvm", async () => {
    await loadNvm({ dir: "/opt/nvm", env: { NVM_DIR: "/opt/nvm" } });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(nvmShReads()).toEqual(["/opt/nvm/nvm.sh"]);

    await loadNvm({ dir: "/cfg/nvm", env: { XDG_CONFIG_HOME: "/cfg" } });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(nvmShReads()).toEqual(["/cfg/nvm/nvm.sh"]);

    await loadNvm();
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(nvmShReads()).toEqual([`${NVM_HOME}/nvm.sh`]);
  });

  it("walks past a candidate that holds no nvm.sh", async () => {
    await loadNvm({ dir: "/cfg/nvm", env: { NVM_DIR: "/opt/nvm", XDG_CONFIG_HOME: "/cfg" } });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(nvmShReads()).toEqual(["/opt/nvm/nvm.sh", "/cfg/nvm/nvm.sh"]);
  });

  it("ignores whitespace-only env vars rather than probing bogus paths", async () => {
    await loadNvm({ env: { NVM_DIR: "   ", XDG_CONFIG_HOME: "\t" } });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(true);
    expect(nvmShReads()).toEqual([`${NVM_HOME}/nvm.sh`]);
  });

  it("skips the home candidate when the OS cannot resolve one", async () => {
    await loadNvm();
    replaceForTest(os, "homedir", () => {
      throw new Error("no home");
    });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });
});

describe("nvm / nvm-windows mutual exclusion", () => {
  it("shows exactly one provider for `nvm` per platform", async () => {
    await system.load({
      platform: "win32",
      bin: { nvm: "C:\\Users\\u\\AppData\\Local\\nvm\\nvm.exe", bash: GIT_BASH },
      commands: [{ argv: ["nvm", "version"], stdout: "1.1.12" }],
    });
    await expect(new NvmProvider().isAvailable()).resolves.toBe(false);
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(true);

    await loadNvm();
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
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
    expect(compareReleases("0.9.0", "0.10.0")).toBeLessThan(0);
    expect(compareReleases("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });

  it("reports equality, including across missing trailing segments", () => {
    expect(compareReleases("0.40.6", "0.40.6")).toBe(0);
    expect(compareReleases("0.40", "0.40.0")).toBe(0);
    expect(compareReleases("0.40.0", "0.40")).toBe(0);
    expect(compareReleases("v0.40.6", "0.40.6")).toBe(0);
  });

  it("pads the shorter side with zeros in either direction", () => {
    expect(compareReleases("0.40", "0.40.1")).toBeLessThan(0);
    expect(compareReleases("0.40.1", "0.40")).toBeGreaterThan(0);
  });

  it("returns null — never a guess — when either side is not dotted-numeric", () => {
    expect(compareReleases("0.40.6-beta", "0.40.6")).toBeNull();
    expect(compareReleases("0.40.6", "nightly")).toBeNull();
    expect(compareReleases("", "0.40.6")).toBeNull();
  });
});

describe("NvmProvider.listOutdated", () => {
  it("spawns nothing when no nvm.sh is on disk", async () => {
    await system.load({ platform: "linux", bin: { bash: "/bin/bash" } });
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });

  it("hands the directory to the bash child through its env, never the script", async () => {
    await loadNvm();
    await new NvmProvider().listOutdated();
    const [child] = system.trace.spawns;
    expect(child?.argv).toEqual(NVM_VERSION_ARGV);
    expect(child?.argv.join(" ")).not.toContain(NVM_HOME);
    // NVM_DIR is pinned to the directory actually resolved.
    expect(child?.env).toMatchObject({ GUP_NVM_DIR: NVM_HOME, NVM_DIR: NVM_HOME });
  });

  it("asks GitHub nothing when nvm prints no version", async () => {
    await loadNvm({ version: "bash: nvm: command not found" });
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists nothing, and never asks about the clone, when the tag holds no version", async () => {
    await loadNvm({ release: { url: NVM_RELEASE.url, json: { tag_name: "v" } } });
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.fsReads).not.toContain(`${NVM_HOME}/.git`);
  });

  it("never asks about the clone when nothing is behind or comparable", async () => {
    for (const version of ["0.40.6", "0.41.0", "0.40.6-beta"]) {
      await loadNvm({ version });
      await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
      expect(system.trace.fsReads).not.toContain(`${NVM_HOME}/.git`);
    }
  });

  it("returns [] when the nvm.sh probe itself throws, spawning nothing", async () => {
    await loadNvm();
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EACCES");
    });
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });

  it("returns [] rather than throwing when the bash child is rejected", async () => {
    await loadNvm();
    system.inject({ on: "spawn", argv: NVM_VERSION_ARGV, mode: "rejects" });
    await expect(new NvmProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("NvmProvider.update", () => {
  /** The outcome of `update("nvm")`, with nothing installed unless `installs` says so. */
  async function failedUpdate(): Promise<{ message?: string; skipped?: boolean }> {
    const outcome = await new NvmProvider().update("nvm");
    expect(outcome).toMatchObject({ id: "nvm", success: false });
    return outcome;
  }

  it("fails, without skipping, when no nvm install can be located", async () => {
    await system.load({ platform: "linux", bin: { bash: "/bin/bash", git: "/usr/bin/git" } });
    const outcome = await failedUpdate();
    expect(outcome.skipped).toBeUndefined();
    expect(outcome.message).toContain("NVM_DIR");
    expect(installArgvs()).toEqual([]);
  });

  it("skips a copied tree without even looking for git", async () => {
    await loadNvm({ isClone: false });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(failedUpdate()).resolves.toMatchObject({ skipped: true });
    expect(probe).not.toHaveBeenCalled();
  });

  it("fails when git is missing, before asking GitHub", async () => {
    await system.load({ ...nvmMachine({ version: "0.40.5" }), bin: { bash: "/bin/bash" } });
    expect((await failedUpdate()).message).toContain("git est introuvable");
    expect(system.trace.requests).toEqual([]);
  });

  it("fails when the releases feed is unreachable", async () => {
    await loadNvm({ release: { url: NVM_RELEASE.url, status: 503, json: {} } });
    expect((await failedUpdate()).message).toContain("API GitHub");
    expect(installArgvs()).toEqual([]);
  });

  it("skips when the checkout already sits on the published tag", async () => {
    await loadNvm({ version: "0.40.6" });
    await expect(failedUpdate()).resolves.toMatchObject({ skipped: true });
    expect(installArgvs()).toEqual([]);
  });

  it.each([
    ["unreadable", { ...nvmMachine({ version: "" }), commands: [{ argv: NVM_VERSION_ARGV, exitCode: 1 }] }],
    ["not comparable", nvmMachine({ version: "0.40.5-beta" })],
  ])("proceeds when the installed version is %s", async (_kind, machine) => {
    await system.load(machine);
    await expect(new NvmProvider().update("nvm")).resolves.toMatchObject({ success: true });
    expect(installArgvs()).toEqual(nvmUpgradeArgvs(NVM_HOME, "v0.40.6"));
  });

  it("reports a failed fetch and never reaches the checkout", async () => {
    await loadNvm();
    system.answerInstall({ exitCode: 1 });
    expect((await failedUpdate()).message).toContain("git fetch --tags origin");
    expect(installArgvs()).toHaveLength(1);
  });

  it("never downloads and runs the install script", async () => {
    await loadNvm();
    await new NvmProvider().update("nvm");
    const spawned = system.trace.spawns.map((spawn) => spawn.argv.join(" "));
    expect(spawned.filter((line) => line.includes("curl"))).toEqual([]);
  });

  it("fails soft, installing nothing, when the bash child is rejected mid-update", async () => {
    await loadNvm();
    system.inject({ on: "spawn", argv: NVM_VERSION_ARGV, mode: "rejects" });
    const outcome = await failedUpdate();
    expect(outcome.message).toContain(INSTALL_DOC);
    expect(outcome.skipped).toBeUndefined();
    expect(installArgvs()).toEqual([]);
  });

  it("fails soft, asking GitHub nothing, when the git probe is rejected", async () => {
    await loadNvm();
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("PATH exploded")));
    expect((await failedUpdate()).message).toContain(INSTALL_DOC);
    expect(system.trace.requests).toEqual([]);
    expect(installArgvs()).toEqual([]);
  });

  it("fails soft when the nvm.sh probe throws instead of answering", async () => {
    await loadNvm();
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EACCES");
    });
    expect((await failedUpdate()).message).toContain(INSTALL_DOC);
    expect(installArgvs()).toEqual([]);
  });

  it("fails soft when the fetch spawn is rejected outright", async () => {
    await loadNvm();
    const [fetchTags] = nvmUpgradeArgvs(NVM_HOME, "v0.40.6");
    system.inject({ on: "spawn", argv: fetchTags ?? [], mode: "rejects" });
    expect((await failedUpdate()).message).toContain(INSTALL_DOC);
  });
});

describe("NvmProvider metadata", () => {
  it("sends Windows to nvm-windows and everyone else to the README", async () => {
    await system.load({ platform: "win32" });
    const hint = new NvmProvider().installHint;
    expect(hint).toContain("nvm-windows");
    expect(hint).not.toContain("nvm-sh/nvm#installing");
    for (const platform of ["darwin", "linux"] as const) {
      await system.load({ platform });
      expect(new NvmProvider().installHint).toBe(INSTALL_DOC);
    }
  });

  it("is declared slow — it sources a shell and calls GitHub", () => {
    expect(new NvmProvider().slow).toBe(true);
  });
});
