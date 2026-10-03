import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import type { RunResult } from "../../../src/core/runner.js";
import {
  buildUpgradeArgs,
  CygwinProvider,
  cygwinRootCandidates,
  interpretSetupExit,
  setupExeCandidates,
} from "../../../src/providers/os/cygwin.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import type { SimPlatform } from "../../support/system/types.js";
import { installArgvs, installs } from "../../support/system/trace.js";
import {
  CYGCHECK,
  CYGWIN_ROOT,
  cygwinMachine,
  cygwinUpgradeArgv,
  SETUP_IN_DOWNLOADS,
  SETUP_IN_ROOT,
} from "./windows.cases.js";

/**
 * Cygwin ships no package manager binary: its standalone setup is both the
 * installer and the upgrader, lives wherever the user downloaded it, and may
 * self-elevate — so a zero exit only means something when gup is elevated.
 */

const NO_ROOT_MESSAGE =
  "Racine Cygwin introuvable — définir CYGWIN_ROOT sur le dossier d'installation.";
const MISSING_SETUP_NOTE = "setup-x86_64.exe introuvable — à télécharger";

/** A drive spec immediately followed by a name is drive-*relative* on Windows. */
const DRIVE_RELATIVE = /^[A-Za-z]:(?![\\/])/;

function exit(exitCode: number, flags: Partial<RunResult> = {}): RunResult {
  return { stdout: "", stderr: "", exitCode, failed: exitCode !== 0, ...flags };
}

const REFRESH_ROW = { id: "cygwin", current: "?", latest: "refresh" };

describe("cygwinRootCandidates", () => {
  it("probes both default install directories on the system drive", () => {
    expect(cygwinRootCandidates({ SystemDrive: "C:" })).toEqual(["C:\\cygwin64", "C:\\cygwin"]);
  });

  it("falls back to a hardcoded C: after a non-C system drive", () => {
    expect(cygwinRootCandidates({ SystemDrive: "D:" })).toEqual([
      "D:\\cygwin64",
      "D:\\cygwin",
      "C:\\cygwin64",
      "C:\\cygwin",
    ]);
  });

  it("deduplicates the C: fallback when the system drive already is C:", () => {
    expect(cygwinRootCandidates({ SystemDrive: "C:" })).toHaveLength(2);
  });

  it("never emits a drive-relative path such as C:cygwin64", () => {
    const all = [
      ...cygwinRootCandidates({ SystemDrive: "D:" }),
      ...cygwinRootCandidates({ CYGWIN_ROOT: "C:" }),
      ...cygwinRootCandidates({ CYGWIN_ROOT: "D:/" }),
    ];
    for (const candidate of all) expect(candidate).not.toMatch(DRIVE_RELATIVE);
  });

  it("keeps the separator on a bare drive spec given as CYGWIN_ROOT", () => {
    expect(cygwinRootCandidates({ CYGWIN_ROOT: "C:" })[0]).toBe("C:\\");
    expect(cygwinRootCandidates({ CYGWIN_ROOT: "D:/" })[0]).toBe("D:\\");
  });

  it("trims CYGWIN_ROOT and drops its trailing separators", () => {
    expect(cygwinRootCandidates({ CYGWIN_ROOT: "  D:\\cyg\\\\  ", SystemDrive: "C:" })).toEqual([
      "D:\\cyg",
      "C:\\cygwin64",
      "C:\\cygwin",
    ]);
  });

  it("deduplicates a CYGWIN_ROOT pointing at a default location", () => {
    expect(cygwinRootCandidates({ CYGWIN_ROOT: CYGWIN_ROOT, SystemDrive: "C:" })).toEqual([
      "C:\\cygwin64",
      "C:\\cygwin",
    ]);
  });

  it("ignores a blank CYGWIN_ROOT and a blank SystemDrive", () => {
    expect(cygwinRootCandidates({ CYGWIN_ROOT: "   ", SystemDrive: " " })).toEqual([
      "C:\\cygwin64",
      "C:\\cygwin",
    ]);
    expect(cygwinRootCandidates({})).toEqual(["C:\\cygwin64", "C:\\cygwin"]);
  });
});

describe("setupExeCandidates", () => {
  it("looks next to the tree, then in the profile's Downloads folder", () => {
    expect(setupExeCandidates(CYGWIN_ROOT, { USERPROFILE: WIN_HOME })).toEqual([
      SETUP_IN_ROOT,
      SETUP_IN_DOWNLOADS,
    ]);
  });

  it("drops the Downloads probe when USERPROFILE is unset or blank", () => {
    expect(setupExeCandidates(CYGWIN_ROOT, {})).toEqual([SETUP_IN_ROOT]);
    expect(setupExeCandidates(CYGWIN_ROOT, { USERPROFILE: "   " })).toEqual([SETUP_IN_ROOT]);
  });

  it("only ever probes the exact setup-x86_64.exe name", () => {
    for (const candidate of setupExeCandidates(CYGWIN_ROOT, { USERPROFILE: WIN_HOME })) {
      expect(candidate.endsWith("\\setup-x86_64.exe")).toBe(true);
    }
  });
});

describe("buildUpgradeArgs", () => {
  it("builds the documented unattended full-upgrade argv", () => {
    expect(buildUpgradeArgs(CYGWIN_ROOT)).toEqual([
      "--quiet-mode",
      "--upgrade-also",
      "--no-shortcuts",
      "--wait",
      "--root",
      CYGWIN_ROOT,
    ]);
  });

  it("passes no mirror and nothing that removes packages", () => {
    const args = buildUpgradeArgs(CYGWIN_ROOT);
    for (const forbidden of ["--site", "--prune-install", "--delete-orphans"]) {
      expect(args).not.toContain(forbidden);
    }
  });
});

describe("interpretSetupExit", () => {
  it("reads a Ctrl+C skip or a timeout kill as a failure whatever the code", () => {
    const failed = { id: "cygwin", success: false };
    expect(interpretSetupExit(exit(0, { aborted: true }), true)).toEqual(failed);
    expect(interpretSetupExit(exit(0, { timedOut: true }), true)).toEqual(failed);
    // Never laundered into the "we cannot tell" branch.
    expect(interpretSetupExit(exit(0, { aborted: true }), false)).toEqual(failed);
  });

  it("reads exit 118 as a success needing a reboot", () => {
    const outcome = interpretSetupExit(exit(118), true);
    expect(outcome.success).toBe(true);
    expect(outcome.message).toMatch(/redémarrage/);
  });

  it("keeps reading 118 as a reboot-success even when gup was not elevated", () => {
    // 118 can only come from the in-process branch: it is meaningful whatever
    // the elevation state and must not be downgraded to the UAC caveat.
    const outcome = interpretSetupExit(exit(118), false);
    expect(outcome.success).toBe(true);
    expect(outcome.message).toMatch(/redémarrage/);
    expect(outcome.message).not.toMatch(/UAC/);
  });

  it("lets a Ctrl+C skip win over the 118 reboot code", () => {
    const failed = { id: "cygwin", success: false };
    expect(interpretSetupExit(exit(118, { aborted: true }), true)).toEqual(failed);
    expect(interpretSetupExit(exit(118, { timedOut: true }), false)).toEqual(failed);
  });

  it("reads any other non-zero exit as a failure", () => {
    expect(interpretSetupExit(exit(1), true)).toEqual({ id: "cygwin", success: false });
    expect(interpretSetupExit(exit(1), false)).toEqual({ id: "cygwin", success: false });
  });

  it("cannot trust a zero exit when setup may have self-elevated", () => {
    const outcome = interpretSetupExit(exit(0), false);
    expect(outcome.success).toBe(true);
    expect(outcome.message).toMatch(/UAC/);
  });

  it("trusts a zero exit when gup itself was already elevated", () => {
    expect(interpretSetupExit(exit(0), true)).toEqual({ id: "cygwin", success: true });
  });
});

describe("CygwinProvider off Windows", () => {
  it.each<SimPlatform>(["linux", "darwin"])(
    "never touches the filesystem nor spawns on %s, and defers updates",
    async (platform) => {
      await system.load({ platform, env: { SystemDrive: "C:" } });
      const provider = new CygwinProvider();
      await expect(provider.isAvailable()).resolves.toBe(false);
      await expect(provider.listOutdated()).resolves.toEqual([]);
      await expect(provider.update("cygwin")).resolves.toMatchObject({
        id: "cygwin",
        success: false,
        skipped: true,
      });
      expect(system.trace.fsReads).toEqual([]);
      expect(system.trace.spawns).toEqual([]);
    },
  );
});

describe("CygwinProvider tree discovery", () => {
  it("ignores an empty tree left behind by an uninstall", async () => {
    await system.load({ platform: "win32", fs: { [CYGWIN_ROOT]: { kind: "dir" } } });
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(false);
  });

  it("honours an explicit CYGWIN_ROOT", async () => {
    await system.load({
      platform: "win32",
      env: { CYGWIN_ROOT: "E:\\cyg\\" },
      fs: { "E:\\cyg\\bin\\cygcheck.exe": { kind: "file" } },
    });
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(true);
  });

  it("accepts a tree installed at the root of a drive", async () => {
    await system.load({
      platform: "win32",
      env: { CYGWIN_ROOT: "D:/" },
      fs: { "D:\\bin\\cygcheck.exe": { kind: "file" } },
    });
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(true);
    expect(system.trace.fsReads[0]).toBe("D:\\bin\\cygcheck.exe");
  });

  it("treats an existsSync throw as 'not there' rather than a scan failure", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT));
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EPERM");
    });
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(false);
  });

  it("swallows a non-string env value instead of aborting provider detection", async () => {
    // Detection awaits every provider together: a throw here would take the
    // whole detection pass down.
    await system.load(cygwinMachine(SETUP_IN_ROOT));
    process.env = { ...process.env, CYGWIN_ROOT: 42 as unknown as string };
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });
});

describe("CygwinProvider.listOutdated", () => {
  it("returns [] when no Cygwin tree is installed", async () => {
    await system.load({ platform: "win32" });
    await expect(new CygwinProvider().listOutdated()).resolves.toEqual([]);
  });

  it("accepts a setup left in the profile's Downloads folder", async () => {
    await system.load(cygwinMachine(SETUP_IN_DOWNLOADS));
    const [row] = await new CygwinProvider().listOutdated();
    expect(row?.note).toBe("setup-x86_64.exe -q -g");
  });

  it("still emits the row when the setup probe itself throws", async () => {
    // The tree was found, so the row is real: "download it" beats losing it.
    await system.load(cygwinMachine(SETUP_IN_ROOT));
    const existsSync = fs.existsSync;
    replaceForTest(fs, "existsSync", (path) => {
      if (String(path) === CYGCHECK) return existsSync(path);
      throw new Error("EPERM");
    });
    const rows = await new CygwinProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe(MISSING_SETUP_NOTE);
  });
});

describe("CygwinProvider.update", () => {
  it("skips when no Cygwin tree is installed", async () => {
    await system.load({ platform: "win32" });
    await expect(new CygwinProvider().update("cygwin")).resolves.toEqual({
      id: "cygwin",
      success: false,
      skipped: true,
      message: NO_ROOT_MESSAGE,
    });
    expect(installArgvs()).toEqual([]);
  });

  it("runs setup from its own directory, pinned to the detected root", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT, true));
    await expect(new CygwinProvider().update("cygwin")).resolves.toEqual({
      id: "cygwin",
      success: true,
    });
    expect(installs()).toEqual([
      {
        mode: "inherit",
        argv: cygwinUpgradeArgv(SETUP_IN_ROOT, CYGWIN_ROOT),
        shell: false,
        cwd: CYGWIN_ROOT,
      },
    ]);
  });

  it("keeps setup's cache and log next to a Downloads-resident installer", async () => {
    await system.load(cygwinMachine(SETUP_IN_DOWNLOADS, true));
    await new CygwinProvider().update("cygwin");
    expect(installs()).toEqual([
      {
        mode: "inherit",
        argv: cygwinUpgradeArgv(SETUP_IN_DOWNLOADS, CYGWIN_ROOT),
        shell: false,
        cwd: `${WIN_HOME}\\Downloads`,
      },
    ]);
  });

  it("turns a setup the runner refuses into a failed outcome, not a throw", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT, true));
    system.answerInstall({ rejects: true });
    const outcome = await new CygwinProvider().update("cygwin");
    expect(outcome).toMatchObject({ id: "cygwin", success: false });
    expect(outcome.message).toMatch(/^Lancement de setup-x86_64\.exe impossible : injected fault/);
  });

  it("stringifies a non-Error rejection from the elevation probe", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT));
    replaceForTest(runner, "isElevated", () => Promise.reject("nope"));
    await expect(new CygwinProvider().update("cygwin")).resolves.toEqual({
      id: "cygwin",
      success: false,
      message: "Lancement de setup-x86_64.exe impossible : nope",
    });
    expect(installArgvs()).toEqual([]);
  });

  it("ignores the package id — there is only one row", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT, true));
    await expect(new CygwinProvider().update("whatever")).resolves.toMatchObject({
      id: "cygwin",
    });
  });

  it("reports exit 118 as a success that needs a reboot", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT, true));
    system.answerInstall({ exitCode: 118 });
    const outcome = await new CygwinProvider().update("cygwin");
    expect(outcome.success).toBe(true);
    expect(outcome.message).toMatch(/redémarrage/);
  });
});

describe("CygwinProvider.updateAll", () => {
  it("collapses several rows into the one setup run this provider has", async () => {
    await system.load(cygwinMachine(SETUP_IN_ROOT, true));
    const outcomes = await new CygwinProvider().updateAll([REFRESH_ROW, REFRESH_ROW]);
    expect(outcomes).toEqual([{ id: "cygwin", success: true }]);
    expect(installArgvs()).toHaveLength(1);
  });

  it("skips the whole selection when no Cygwin tree is installed", async () => {
    await system.load({ platform: "win32" });
    await expect(new CygwinProvider().updateAll([REFRESH_ROW])).resolves.toEqual([
      { id: "cygwin", success: false, skipped: true, message: NO_ROOT_MESSAGE },
    ]);
    expect(installArgvs()).toEqual([]);
  });
});
