import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import type { OutdatedPackage } from "../../../src/core/types.js";
import {
  Msys2Provider,
  msys2RootCandidates,
  parsePacmanUpgrades,
} from "../../../src/providers/os/msys2.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  MSYS2_BASE_NOTE,
  MSYS2_CORE_NOTE,
  MSYS2_SYNC_FAILED,
  msys2Machine,
  PACMAN,
} from "./windows.cases.js";

/**
 * MSYS2: the pacman set inside an MSYS2 root, found by absolute path and
 * upgraded with `pacman -S` on the selected targets — never `-Syu`, whose
 * `--noconfirm` answer would kill every running MSYS2 shell.
 */

const PACMAN32 = "C:\\msys32\\usr\\bin\\pacman.exe";
const NO_ROOT_MESSAGE =
  "Racine MSYS2 introuvable — définir MSYS2_ROOT sur le dossier d'installation.";
const STILL_PENDING_MESSAGE =
  "Toujours listé par pacman -Qu après la transaction : mise à jour non appliquée.";
const IGNORED_NOTE = "ignoré par pacman (IgnorePkg / dépôt exclu) — sera forcé";

/** A drive spec immediately followed by a name is drive-*relative* on Windows. */
const DRIVE_RELATIVE = /^[A-Za-z]:(?![\\/])/;

function row(id: string): OutdatedPackage {
  return { id, current: "1", latest: "2" };
}

describe("msys2RootCandidates", () => {
  it("probes both default roots on the system drive", () => {
    expect(msys2RootCandidates({ SystemDrive: "C:" })).toEqual(["C:\\msys64", "C:\\msys32"]);
  });

  it("never emits a drive-relative path such as C:msys64", () => {
    for (const candidate of msys2RootCandidates({ SystemDrive: "D:" })) {
      expect(candidate).not.toMatch(DRIVE_RELATIVE);
    }
    expect(msys2RootCandidates({ SystemDrive: "D:" })[0]).toBe("D:\\msys64");
  });

  it("falls back to a hardcoded C: after a non-C system drive", () => {
    expect(msys2RootCandidates({ SystemDrive: "D:" })).toEqual([
      "D:\\msys64",
      "D:\\msys32",
      "C:\\msys64",
      "C:\\msys32",
    ]);
  });

  it("deduplicates the C: fallback when the system drive already is C:", () => {
    expect(msys2RootCandidates({ SystemDrive: "C:" })).toHaveLength(2);
  });

  it("puts a trimmed MSYS2_ROOT first and deduplicates it against the defaults", () => {
    expect(
      msys2RootCandidates({ MSYS2_ROOT: "  D:\\tools\\msys2  ", SystemDrive: "C:" }),
    ).toEqual(["D:\\tools\\msys2", "C:\\msys64", "C:\\msys32"]);
    expect(msys2RootCandidates({ MSYS2_ROOT: "C:\\msys64", SystemDrive: "C:" })).toEqual([
      "C:\\msys64",
      "C:\\msys32",
    ]);
  });

  it("ignores a blank MSYS2_ROOT and a blank SystemDrive", () => {
    expect(msys2RootCandidates({ MSYS2_ROOT: "   ", SystemDrive: "  " })).toEqual([
      "C:\\msys64",
      "C:\\msys32",
    ]);
  });

  it("still probes C: when the env carries nothing at all", () => {
    expect(msys2RootCandidates({})).toEqual(["C:\\msys64", "C:\\msys32"]);
  });
});

describe("parsePacmanUpgrades", () => {
  it("parses the `name old -> new` shape and notes the stale local sync DB", () => {
    expect(parsePacmanUpgrades("mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1")).toEqual([
      {
        id: "mingw-w64-x86_64-gcc",
        name: "mingw-w64-x86_64-gcc",
        current: "13.3.0-1",
        latest: "14.2.0-1",
        note: MSYS2_BASE_NOTE,
      },
    ]);
  });

  it("flags a core package so the user knows to relaunch every MSYS2 shell", () => {
    const rows = parsePacmanUpgrades(
      [
        "bash 5.2.037-2 -> 5.3.093-1",
        "filesystem 2025.02-6 -> 2025.08-1",
        "mintty 1~3.7.7-1 -> 1~3.8.0-1",
        "msys2-runtime 3.5.4-2 -> 3.5.7-2",
        "pacman 6.1.0-13 -> 7.0.0-1",
        "pacman-mirrors 20250219-1 -> 20250801-1",
      ].join("\n"),
    );
    expect(rows.map((parsed) => parsed.note)).toEqual(Array(6).fill(MSYS2_CORE_NOTE));
  });

  it("treats msys2-runtime-* as core through the prefix rule too", () => {
    const rows = parsePacmanUpgrades(
      "msys2-runtime-devel 3.5.4-2 -> 3.5.7-2\nmsys2-runtime-3.5 3.5.4-2 -> 3.5.7-2",
    );
    expect(rows.map((parsed) => parsed.note)).toEqual([MSYS2_CORE_NOTE, MSYS2_CORE_NOTE]);
  });

  it("keeps an [ignored] row and says it will be forced", () => {
    expect(
      parsePacmanUpgrades("mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1 [ignored]")[0]?.note,
    ).toBe(`${MSYS2_BASE_NOTE} · ${IGNORED_NOTE}`);
  });

  it("matches the marker on its brackets, not on the English wording", () => {
    // pacman routes the marker through _(): a French install prints "[ignoré]".
    expect(parsePacmanUpgrades("pacman 6.1.0-13 -> 7.0.0-1 [ignoré]")[0]?.note).toContain(
      "sera forcé",
    );
  });

  it("combines the core and ignored notes on the same row", () => {
    expect(parsePacmanUpgrades("bash 5.2.037-2 -> 5.3.093-1 [ignored]")[0]?.note).toBe(
      `${MSYS2_CORE_NOTE} · ${IGNORED_NOTE}`,
    );
  });

  it("ignores unbracketed trailing junk", () => {
    expect(parsePacmanUpgrades("zlib 1.3.1-1 -> 1.3.2-1 whatever")[0]?.note).toBe(
      MSYS2_BASE_NOTE,
    );
  });

  it("needs something inside the brackets — an empty [] is not the marker", () => {
    expect(parsePacmanUpgrades("zlib 1.3.1-1 -> 1.3.2-1 []")[0]?.note).toBe(MSYS2_BASE_NOTE);
  });

  it("matches core packages exactly, never by prefix on a non-core name", () => {
    // Only `msys2-runtime-` is a prefix rule: telling a user to close every
    // MSYS2 shell for `bash-completion` would be noise.
    const notes = parsePacmanUpgrades(
      [
        "bash-completion 2.11-3 -> 2.16-1",
        "pacman-contrib 1.5.4-1 -> 1.5.5-1",
        "mintty-extra 1.0-1 -> 1.1-1",
        "not-msys2-runtime 1.0-1 -> 1.1-1",
      ].join("\n"),
    ).map((parsed) => parsed.note);
    expect(notes).toEqual(Array(4).fill(MSYS2_BASE_NOTE));
  });

  it("strips SGR colour sequences before matching", () => {
    expect(
      parsePacmanUpgrades(
        "\u001b[1mmsys2-runtime\u001b[0m \u001b[36m3.5.4-2\u001b[0m -> \u001b[32m3.5.7-2\u001b[0m",
      ),
    ).toEqual([
      {
        id: "msys2-runtime",
        name: "msys2-runtime",
        current: "3.5.4-2",
        latest: "3.5.7-2",
        note: MSYS2_CORE_NOTE,
      },
    ]);
  });

  it("never emits a current == latest no-op row", () => {
    expect(parsePacmanUpgrades("zlib 1.3.1-1 -> 1.3.1-1")).toEqual([]);
  });

  it("returns [] for the nothing-to-do case, blanks and garbage", () => {
    for (const output of [
      "",
      "\n \n\t\n",
      "error: no usable package repositories configured.",
      ":: Synchronizing package databases...",
      "-> 1.0-1",
    ]) {
      expect(parsePacmanUpgrades(output)).toEqual([]);
    }
  });

  it("handles CRLF output and skips the lines around the rows", () => {
    expect(
      parsePacmanUpgrades("warning: config file\r\nzlib 1.3.1-1 -> 1.3.2-1\r\n\r\n"),
    ).toEqual([
      { id: "zlib", name: "zlib", current: "1.3.1-1", latest: "1.3.2-1", note: MSYS2_BASE_NOTE },
    ]);
  });
});

describe("Msys2Provider off Windows", () => {
  it.each<SimPlatform>(["linux", "darwin"])(
    "never touches the filesystem nor spawns on %s, and defers updates",
    async (platform) => {
      // A POSIX tree cannot hold C:\msys64: what matters is that nothing is probed.
      await system.load({ platform, env: { SystemDrive: "C:" } });
      const provider = new Msys2Provider();
      await expect(provider.isAvailable()).resolves.toBe(false);
      await expect(provider.listOutdated()).resolves.toEqual([]);
      await expect(provider.update("bash")).resolves.toMatchObject({
        id: "bash",
        success: false,
        skipped: true,
      });
      expect(system.trace.fsReads).toEqual([]);
      expect(system.trace.spawns).toEqual([]);
    },
  );
});

describe("Msys2Provider root discovery", () => {
  it("falls through to the 32-bit root", async () => {
    await system.load({ platform: "win32", fs: { [PACMAN32]: { kind: "file" } } });
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(true);
  });

  it("honours an explicit MSYS2_ROOT before the defaults", async () => {
    const custom = "D:\\tools\\msys2\\usr\\bin\\pacman.exe";
    await system.load({
      platform: "win32",
      env: { MSYS2_ROOT: "D:\\tools\\msys2" },
      fs: { [custom]: { kind: "file" }, [PACMAN]: { kind: "file" } },
    });
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(true);
    expect(system.trace.fsReads).toEqual([custom]);
  });

  it("treats an existsSync throw as 'not there' rather than a scan failure", async () => {
    await system.load(msys2Machine(""));
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EPERM");
    });
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(false);
  });

  it("swallows a non-string env value instead of throwing out of the scan", async () => {
    await system.load(msys2Machine(""));
    // process.env coerces to strings; a replaced object does not.
    process.env = { ...process.env, MSYS2_ROOT: 42 as unknown as string };
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });
});

describe("Msys2Provider.listOutdated", () => {
  it("asks the local DB only — `-Qu`, never `-Sy`", async () => {
    await system.load(msys2Machine("zlib 1.3.1-1 -> 1.3.2-1\n"));
    await new Msys2Provider().listOutdated();
    expect(probeArgvs()).toEqual([[PACMAN, "-Qu"]]);
  });

  it("returns [] without spawning anything when no root is found", async () => {
    await system.load({ platform: "win32" });
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.spawns).toEqual([]);
  });

  it("returns [] when nothing is pending", async () => {
    await system.load(msys2Machine(""));
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
  });

  it("reads stdout, not the exit status — `-Qu` exits 1 with rows to show", async () => {
    await system.load({
      ...msys2Machine(""),
      commands: [{ argv: [PACMAN, "-Qu"], stdout: "zlib 1.3.1-1 -> 1.3.2-1\n", exitCode: 1 }],
    });
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([
      { id: "zlib", name: "zlib", current: "1.3.1-1", latest: "1.3.2-1", note: MSYS2_BASE_NOTE },
    ]);
  });

  it("returns [] rather than throwing when the runner refuses pacman", async () => {
    await system.load(msys2Machine("zlib 1.3.1-1 -> 1.3.2-1\n"));
    system.inject({ on: "spawn", argv: [PACMAN, "-Qu"], mode: "rejects" });
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
  });
});

describe("Msys2Provider.update", () => {
  it("never runs -Syu, whose --noconfirm answer kills the user's MSYS2 shells", async () => {
    await system.load(msys2Machine(""));
    await new Msys2Provider().update("msys2-runtime");
    await new Msys2Provider().updateAll([row("bash"), row("zlib")]);
    for (const argv of installArgvs()) {
      const flags = argv.slice(1).filter((arg) => arg.startsWith("-"));
      expect(flags).toEqual(["-S", "--needed", "--noconfirm"]);
    }
  });

  it("turns a pacman the runner refuses into a failed outcome, not a throw", async () => {
    await system.load(msys2Machine(""));
    system.answerInstall({ rejects: true });
    const outcome = await new Msys2Provider().update("bash");
    expect(outcome).toMatchObject({ id: "bash", success: false });
    expect(outcome.message).toMatch(/^Lancement de pacman impossible : injected fault/);
  });

  it("stringifies a non-Error rejection", async () => {
    await system.load(msys2Machine(""));
    replaceForTest(runner, "runInherit", () => Promise.reject("nope"));
    await expect(new Msys2Provider().update("bash")).resolves.toEqual({
      id: "bash",
      success: false,
      message: "Lancement de pacman impossible : nope",
    });
  });

  it("skips (rather than fails) when no MSYS2 root exists", async () => {
    await system.load({ platform: "win32" });
    await expect(new Msys2Provider().update("bash")).resolves.toEqual({
      id: "bash",
      success: false,
      skipped: true,
      message: NO_ROOT_MESSAGE,
    });
    expect(installArgvs()).toEqual([]);
  });
});

describe("Msys2Provider.updateAll", () => {
  it("skips every row when no MSYS2 root exists", async () => {
    await system.load({ platform: "win32" });
    const outcomes = await new Msys2Provider().updateAll([row("bash"), row("zlib")]);
    expect(outcomes).toEqual([
      { id: "bash", success: false, skipped: true, message: NO_ROOT_MESSAGE },
      { id: "zlib", success: false, skipped: true, message: NO_ROOT_MESSAGE },
    ]);
    expect(installArgvs()).toEqual([]);
  });

  it("re-queries -Qu to attribute a non-zero batch exit per package", async () => {
    // After the transaction, zlib is still listed and bash is not.
    await system.load(msys2Machine("zlib 1.3.1-1 -> 1.3.2-1\n"));
    system.answerInstall({ exitCode: 1 });
    const outcomes = await new Msys2Provider().updateAll([row("bash"), row("zlib")]);
    expect(outcomes).toEqual([
      { id: "bash", success: true },
      { id: "zlib", success: false, message: MSYS2_SYNC_FAILED },
    ]);
  });

  it("fails a package pacman silently skipped, even on a zero exit", async () => {
    await system.load(msys2Machine("bash 5.2.037-2 -> 5.3.093-1\n"));
    await expect(new Msys2Provider().updateAll([row("bash")])).resolves.toEqual([
      { id: "bash", success: false, message: STILL_PENDING_MESSAGE },
    ]);
  });

  it("falls back to the exit status when the re-query itself cannot run", async () => {
    await system.load(msys2Machine(""));
    system.inject({ on: "spawn", argv: [PACMAN, "-Qu"], mode: "rejects" });
    await expect(new Msys2Provider().updateAll([row("bash")])).resolves.toEqual([
      { id: "bash", success: true },
    ]);
  });

  it("fails every row when both the batch and the re-query failed", async () => {
    await system.load(msys2Machine(""));
    system.inject({ on: "spawn", argv: [PACMAN, "-Qu"], mode: "rejects" });
    system.answerInstall({ exitCode: 1 });
    await expect(new Msys2Provider().updateAll([row("bash")])).resolves.toEqual([
      { id: "bash", success: false, message: MSYS2_SYNC_FAILED },
    ]);
  });
});
