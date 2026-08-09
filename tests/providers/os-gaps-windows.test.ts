import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three Windows-only OS gaps: the pacman set living inside an MSYS2 root,
 * the Cygwin tree driven by its standalone setup executable, and Npackd.
 *
 * All three resolve absolute Windows paths out of `process.env`, so every test
 * here forces `process.platform` and drives a scrubbed env: nothing may depend
 * on the runner actually being Windows, and nothing may leak into the next
 * test. Expected paths are literal strings (never `path.join`) so a Windows
 * runner and a POSIX runner assert the exact same bytes.
 */

const { commandExistsMock, runMock, runInheritMock, isElevatedMock } = vi.hoisted(
  () => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
  }),
);

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: vi.fn(),
}));

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

import {
  Msys2Provider,
  msys2RootCandidates,
  parsePacmanUpgrades,
} from "../../src/providers/os/msys2.js";
import {
  buildUpgradeArgs,
  CygwinProvider,
  cygwinRootCandidates,
  interpretSetupExit,
  setupExeCandidates,
} from "../../src/providers/os/cygwin.js";
import {
  isSafeNpackdPackageName,
  NpackdProvider,
  parseNpackdBareSearch,
  parseNpackdUpdateable,
} from "../../src/providers/os/npackd.js";
import type { RunResult } from "../../src/core/runner.js";
import type { OutdatedPackage } from "../../src/core/types.js";

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

function mkRun(stdout: string, failed = false): RunResult {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

/** Every env var the three providers read. Scrubbed before each test. */
const ENV_KEYS = ["MSYS2_ROOT", "CYGWIN_ROOT", "SystemDrive", "USERPROFILE"];

let savedEnv: NodeJS.ProcessEnv;

/** Make `existsSync` answer true for exactly these absolute paths. */
function existsOnly(...paths: string[]): void {
  const set = new Set(paths);
  existsSyncMock.mockImplementation((p: unknown) => set.has(String(p)));
}

function row(id: string): OutdatedPackage {
  return { id, current: "1", latest: "2" };
}

beforeEach(() => {
  savedEnv = { ...process.env };
  for (const key of ENV_KEYS) delete process.env[key];
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(false);
});

afterEach(() => {
  process.env = savedEnv;
  setPlatform(ORIGINAL_PLATFORM);
});

// Literal Windows paths, spelled out rather than joined.
const MSYS64 = "C:\\msys64";
const PACMAN64 = "C:\\msys64\\usr\\bin\\pacman.exe";
const PACMAN32 = "C:\\msys32\\usr\\bin\\pacman.exe";
const CYG64 = "C:\\cygwin64";
const CYGCHECK64 = "C:\\cygwin64\\bin\\cygcheck.exe";
const SETUP_IN_ROOT = "C:\\cygwin64\\setup-x86_64.exe";
const SETUP_IN_DOWNLOADS = "C:\\Users\\me\\Downloads\\setup-x86_64.exe";

/** A drive spec immediately followed by a name is drive-*relative* on Windows. */
const DRIVE_RELATIVE = /^[A-Za-z]:(?![\\/])/;

// ===========================================================================
// MSYS2 — root discovery
// ===========================================================================

describe("msys2RootCandidates", () => {
  it("probes both default roots on the system drive", () => {
    expect(msys2RootCandidates({ SystemDrive: "C:" })).toEqual([
      "C:\\msys64",
      "C:\\msys32",
    ]);
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
    expect(msys2RootCandidates({ MSYS2_ROOT: MSYS64, SystemDrive: "C:" })).toEqual([
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

// ===========================================================================
// MSYS2 — `pacman -Qu` parser
// ===========================================================================

describe("parsePacmanUpgrades", () => {
  it("parses the `name old -> new` shape and notes the stale local sync DB", () => {
    expect(parsePacmanUpgrades("mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1")).toEqual([
      {
        id: "mingw-w64-x86_64-gcc",
        name: "mingw-w64-x86_64-gcc",
        current: "13.3.0-1",
        latest: "14.2.0-1",
        note: "base locale (pas de -Sy au scan)",
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
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.note).toBe(
        "base locale (pas de -Sy au scan) · cœur MSYS2 : relancer les shells MSYS2 après",
      );
    }
  });

  it("treats msys2-runtime-* as core through the prefix rule too", () => {
    const rows = parsePacmanUpgrades(
      "msys2-runtime-devel 3.5.4-2 -> 3.5.7-2\nmsys2-runtime-3.5 3.5.4-2 -> 3.5.7-2",
    );
    expect(rows.map((r) => r.note)).toEqual([
      "base locale (pas de -Sy au scan) · cœur MSYS2 : relancer les shells MSYS2 après",
      "base locale (pas de -Sy au scan) · cœur MSYS2 : relancer les shells MSYS2 après",
    ]);
  });

  it("keeps an [ignored] row and says it will be forced", () => {
    expect(
      parsePacmanUpgrades("mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1 [ignored]")[0]?.note,
    ).toBe(
      "base locale (pas de -Sy au scan) · ignoré par pacman (IgnorePkg / dépôt exclu) — sera forcé",
    );
  });

  it("matches the marker on its brackets, not on the English wording", () => {
    // pacman routes the marker through _(), so a French install prints
    // "[ignoré]" — the note must not depend on the user's locale.
    expect(parsePacmanUpgrades("pacman 6.1.0-13 -> 7.0.0-1 [ignoré]")[0]?.note).toContain(
      "sera forcé",
    );
  });

  it("combines the core and ignored notes on the same row", () => {
    expect(parsePacmanUpgrades("bash 5.2.037-2 -> 5.3.093-1 [ignored]")[0]?.note).toBe(
      "base locale (pas de -Sy au scan) · cœur MSYS2 : relancer les shells MSYS2 après · ignoré par pacman (IgnorePkg / dépôt exclu) — sera forcé",
    );
  });

  it("ignores unbracketed trailing junk", () => {
    expect(parsePacmanUpgrades("zlib 1.3.1-1 -> 1.3.2-1 whatever")[0]?.note).toBe(
      "base locale (pas de -Sy au scan)",
    );
  });

  it("needs something inside the brackets — an empty [] is not the marker", () => {
    // The rule is `\[[^\]]+\]`, not "contains a bracket": a row must not be
    // announced as force-installed because of a stray pair of brackets.
    expect(parsePacmanUpgrades("zlib 1.3.1-1 -> 1.3.2-1 []")[0]?.note).toBe(
      "base locale (pas de -Sy au scan)",
    );
  });

  it("matches core packages exactly, never by prefix on a non-core name", () => {
    // `bash-completion` and `pacman-contrib` share a prefix with two core
    // packages; only `msys2-runtime-` is a prefix rule. Telling a user to
    // close every MSYS2 shell for `bash-completion` would be noise.
    const notes = parsePacmanUpgrades(
      [
        "bash-completion 2.11-3 -> 2.16-1",
        "pacman-contrib 1.5.4-1 -> 1.5.5-1",
        "mintty-extra 1.0-1 -> 1.1-1",
        "not-msys2-runtime 1.0-1 -> 1.1-1",
      ].join("\n"),
    ).map((r) => r.note);
    expect(notes).toHaveLength(4);
    for (const note of notes) expect(note).toBe("base locale (pas de -Sy au scan)");
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
        note: "base locale (pas de -Sy au scan) · cœur MSYS2 : relancer les shells MSYS2 après",
      },
    ]);
  });

  it("never emits a current == latest no-op row", () => {
    expect(parsePacmanUpgrades("zlib 1.3.1-1 -> 1.3.1-1")).toEqual([]);
  });

  it("returns [] for the nothing-to-do case, blanks and garbage", () => {
    expect(parsePacmanUpgrades("")).toEqual([]);
    expect(parsePacmanUpgrades("\n \n\t\n")).toEqual([]);
    expect(parsePacmanUpgrades("error: no usable package repositories configured.")).toEqual(
      [],
    );
    expect(parsePacmanUpgrades(":: Synchronizing package databases...")).toEqual([]);
    expect(parsePacmanUpgrades("-> 1.0-1")).toEqual([]);
  });

  it("handles CRLF output and skips the lines around the rows", () => {
    expect(
      parsePacmanUpgrades("warning: config file\r\nzlib 1.3.1-1 -> 1.3.2-1\r\n\r\n"),
    ).toEqual([
      {
        id: "zlib",
        name: "zlib",
        current: "1.3.1-1",
        latest: "1.3.2-1",
        note: "base locale (pas de -Sy au scan)",
      },
    ]);
  });
});

// ===========================================================================
// MSYS2 — provider
// ===========================================================================

describe("Msys2Provider.isAvailable", () => {
  it("is Windows-only and never touches the filesystem elsewhere", async () => {
    existsOnly(PACMAN64);
    process.env["SystemDrive"] = "C:";
    for (const platform of ["linux", "darwin"] as const) {
      setPlatform(platform);
      await expect(new Msys2Provider().isAvailable()).resolves.toBe(false);
    }
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("detects the default 64-bit root by absolute path", async () => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    existsOnly(PACMAN64);
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith(PACMAN64);
  });

  it("falls through to the 32-bit root", async () => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    existsOnly(PACMAN32);
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(true);
  });

  it("honours an explicit MSYS2_ROOT before the defaults", async () => {
    setPlatform("win32");
    process.env["MSYS2_ROOT"] = "D:\\tools\\msys2";
    existsOnly("D:\\tools\\msys2\\usr\\bin\\pacman.exe");
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenNthCalledWith(
      1,
      "D:\\tools\\msys2\\usr\\bin\\pacman.exe",
    );
  });

  it("is unavailable when no root holds a pacman.exe", async () => {
    setPlatform("win32");
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(false);
  });

  it("treats an existsSync throw as 'not there' rather than a scan failure", async () => {
    setPlatform("win32");
    existsSyncMock.mockImplementation(() => {
      throw new Error("EPERM");
    });
    await expect(new Msys2Provider().isAvailable()).resolves.toBe(false);
  });

  it("swallows a non-string env value instead of throwing out of the scan", async () => {
    setPlatform("win32");
    const scrubbed = { ...process.env };
    // process.env normally coerces everything to a string; a replaced object
    // does not, which is exactly the case findPacmanExe guards against.
    process.env = { ...scrubbed, MSYS2_ROOT: 42 as unknown as string };
    const probe = new Msys2Provider().isAvailable();
    process.env = scrubbed;
    await expect(probe).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });
});

describe("Msys2Provider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
  });

  it("asks the local DB only — `-Qu`, never `-Sy`", async () => {
    existsOnly(PACMAN64);
    runMock.mockResolvedValueOnce(
      mkRun(
        "mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1\nmsys2-runtime 3.5.4-2 -> 3.5.7-2\n",
      ),
    );
    const rows = await new Msys2Provider().listOutdated();
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(PACMAN64, ["-Qu"]);
    expect(rows.map((r) => r.id)).toEqual(["mingw-w64-x86_64-gcc", "msys2-runtime"]);
  });

  it("returns [] without spawning anything when no root is found", async () => {
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("returns [] when nothing is pending", async () => {
    existsOnly(PACMAN64);
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledWith(PACMAN64, ["-Qu"]);
  });

  it("reads stdout, not the exit status — `-Qu` exits 1 with rows to show", async () => {
    // pacman exits 1 both when nothing is upgradable and when no sync DB was
    // ever downloaded, so a non-zero status must not empty a populated list.
    existsOnly(PACMAN64);
    runMock.mockResolvedValueOnce(mkRun("zlib 1.3.1-1 -> 1.3.2-1\n", true));
    const rows = await new Msys2Provider().listOutdated();
    expect(rows).toEqual([
      {
        id: "zlib",
        name: "zlib",
        current: "1.3.1-1",
        latest: "1.3.2-1",
        note: "base locale (pas de -Sy au scan)",
      },
    ]);
  });

  it("returns [] rather than throwing when pacman cannot be spawned", async () => {
    existsOnly(PACMAN64);
    runMock.mockRejectedValueOnce(new Error("runner: refusing to spawn"));
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] off Windows without probing the filesystem", async () => {
    setPlatform("linux");
    existsOnly(PACMAN64);
    await expect(new Msys2Provider().listOutdated()).resolves.toEqual([]);
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe("Msys2Provider.update", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
  });

  it("upgrades exactly the selected target with -S --needed --noconfirm", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new Msys2Provider().update("bash")).resolves.toEqual({
      id: "bash",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith(PACMAN64, [
      "-S",
      "--needed",
      "--noconfirm",
      "bash",
    ]);
  });

  it("never runs -Syu, whose --noconfirm answer kills the user's MSYS2 shells", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new Msys2Provider().update("msys2-runtime");
    const args = runInheritMock.mock.calls[0]?.[1] as string[];
    expect(args[0]).toBe("-S");
    expect(args).not.toContain("-Syu");
    expect(args).not.toContain("-Su");
    expect(args).not.toContain("-y");
    expect(args.some((a) => a.startsWith("-S") && a.includes("y"))).toBe(false);
  });

  it("reports a non-zero pacman exit as a failure", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new Msys2Provider().update("bash")).resolves.toEqual({
      id: "bash",
      success: false,
      message: "pacman a terminé en erreur — voir sa sortie ci-dessus.",
    });
  });

  it("turns an unspawnable pacman into a failed outcome, not a throw", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    const res = await new Msys2Provider().update("bash");
    expect(res.success).toBe(false);
    expect(res.message).toBe("Lancement de pacman impossible : refusing to spawn");
  });

  it("stringifies a non-Error rejection", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockRejectedValueOnce("nope");
    const res = await new Msys2Provider().update("bash");
    expect(res.message).toBe("Lancement de pacman impossible : nope");
  });

  it("skips (rather than fails) when no MSYS2 root exists", async () => {
    const res = await new Msys2Provider().update("bash");
    expect(res).toEqual({
      id: "bash",
      success: false,
      skipped: true,
      message: "Racine MSYS2 introuvable — définir MSYS2_ROOT sur le dossier d'installation.",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("defers off Windows without probing the filesystem or spawning", async () => {
    setPlatform("darwin");
    existsOnly(PACMAN64);
    const res = await new Msys2Provider().update("bash");
    expect(res).toMatchObject({ id: "bash", success: false, skipped: true });
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("Msys2Provider.updateAll", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
  });

  it("does nothing at all for an empty set", async () => {
    existsOnly(PACMAN64);
    await expect(new Msys2Provider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("skips every row when no MSYS2 root exists", async () => {
    const res = await new Msys2Provider().updateAll([row("bash"), row("zlib")]);
    expect(res).toEqual([
      expect.objectContaining({ id: "bash", success: false, skipped: true }),
      expect.objectContaining({ id: "zlib", success: false, skipped: true }),
    ]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("runs one transaction for the whole selection", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    runMock.mockResolvedValueOnce(mkRun(""));
    const res = await new Msys2Provider().updateAll([row("bash"), row("zlib")]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith(PACMAN64, [
      "-S",
      "--needed",
      "--noconfirm",
      "bash",
      "zlib",
    ]);
    expect(res).toEqual([
      { id: "bash", success: true },
      { id: "zlib", success: true },
    ]);
  });

  it("re-queries -Qu to attribute a non-zero batch exit per package", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    // zlib is still listed as upgradable, bash is not: only zlib failed.
    runMock.mockResolvedValueOnce(mkRun("zlib 1.3.1-1 -> 1.3.2-1\n"));
    const res = await new Msys2Provider().updateAll([row("bash"), row("zlib")]);
    expect(runMock).toHaveBeenCalledWith(PACMAN64, ["-Qu"]);
    expect(res).toEqual([
      { id: "bash", success: true },
      {
        id: "zlib",
        success: false,
        message: "pacman a terminé en erreur — voir sa sortie ci-dessus.",
      },
    ]);
  });

  it("fails a package pacman silently skipped, even on a zero exit", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    runMock.mockResolvedValueOnce(mkRun("bash 5.2.037-2 -> 5.3.093-1\n"));
    const res = await new Msys2Provider().updateAll([row("bash")]);
    expect(res).toEqual([
      {
        id: "bash",
        success: false,
        message:
          "Toujours listé par pacman -Qu après la transaction : mise à jour non appliquée.",
      },
    ]);
  });

  it("falls back to the exit status when the re-query itself cannot run", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    runMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    await expect(new Msys2Provider().updateAll([row("bash")])).resolves.toEqual([
      { id: "bash", success: true },
    ]);
  });

  it("fails every row when both the batch and the re-query failed", async () => {
    existsOnly(PACMAN64);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    runMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    await expect(new Msys2Provider().updateAll([row("bash")])).resolves.toEqual([
      {
        id: "bash",
        success: false,
        message: "pacman a terminé en erreur — voir sa sortie ci-dessus.",
      },
    ]);
  });
});

// ===========================================================================
// Cygwin — root and setup discovery
// ===========================================================================

describe("cygwinRootCandidates", () => {
  it("probes both default install directories on the system drive", () => {
    expect(cygwinRootCandidates({ SystemDrive: "C:" })).toEqual([
      "C:\\cygwin64",
      "C:\\cygwin",
    ]);
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
    expect(cygwinRootCandidates({ CYGWIN_ROOT: "  D:\\cyg\\\\  ", SystemDrive: "C:" })).toEqual(
      ["D:\\cyg", "C:\\cygwin64", "C:\\cygwin"],
    );
  });

  it("deduplicates a CYGWIN_ROOT pointing at a default location", () => {
    expect(cygwinRootCandidates({ CYGWIN_ROOT: CYG64, SystemDrive: "C:" })).toEqual([
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
    expect(setupExeCandidates(CYG64, { USERPROFILE: "C:\\Users\\me" })).toEqual([
      SETUP_IN_ROOT,
      SETUP_IN_DOWNLOADS,
    ]);
  });

  it("drops the Downloads probe when USERPROFILE is unset or blank", () => {
    expect(setupExeCandidates(CYG64, {})).toEqual([SETUP_IN_ROOT]);
    expect(setupExeCandidates(CYG64, { USERPROFILE: "   " })).toEqual([SETUP_IN_ROOT]);
  });

  it("only ever probes the exact setup-x86_64.exe name", () => {
    for (const candidate of setupExeCandidates(CYG64, { USERPROFILE: "C:\\Users\\me" })) {
      expect(candidate.endsWith("\\setup-x86_64.exe")).toBe(true);
    }
  });
});

describe("buildUpgradeArgs", () => {
  it("builds the documented unattended full-upgrade argv", () => {
    expect(buildUpgradeArgs(CYG64)).toEqual([
      "--quiet-mode",
      "--upgrade-also",
      "--no-shortcuts",
      "--wait",
      "--root",
      CYG64,
    ]);
  });

  it("passes no mirror and nothing that removes packages", () => {
    const args = buildUpgradeArgs(CYG64);
    for (const forbidden of ["--site", "--prune-install", "--delete-orphans"]) {
      expect(args).not.toContain(forbidden);
    }
  });
});

describe("interpretSetupExit", () => {
  it("reads a Ctrl+C skip or a timeout kill as a failure whatever the code", () => {
    expect(interpretSetupExit({ ...mkRun(""), aborted: true }, true)).toEqual({
      id: "cygwin",
      success: false,
    });
    expect(interpretSetupExit({ ...mkRun(""), timedOut: true }, true)).toEqual({
      id: "cygwin",
      success: false,
    });
    // Never laundered into the "we cannot tell" branch below.
    expect(interpretSetupExit({ ...mkRun(""), aborted: true }, false)).toEqual({
      id: "cygwin",
      success: false,
    });
  });

  it("reads exit 118 as a success needing a reboot", () => {
    const res = interpretSetupExit(
      { stdout: "", stderr: "", exitCode: 118, failed: true },
      true,
    );
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/redémarrage/);
  });

  it("keeps reading 118 as a reboot-success even when gup was not elevated", () => {
    // 118 can only come from the in-process branch, so it is meaningful
    // whatever the elevation state — it must not be downgraded to the "we
    // cannot tell" caveat.
    const res = interpretSetupExit(
      { stdout: "", stderr: "", exitCode: 118, failed: true },
      false,
    );
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/redémarrage/);
    expect(res.message).not.toMatch(/UAC/);
  });

  it("lets a Ctrl+C skip win over the 118 reboot code", () => {
    // A child killed mid-run can exit with anything; the abort flag is the
    // stronger signal and is checked first.
    expect(
      interpretSetupExit(
        { stdout: "", stderr: "", exitCode: 118, failed: true, aborted: true },
        true,
      ),
    ).toEqual({ id: "cygwin", success: false });
    expect(
      interpretSetupExit(
        { stdout: "", stderr: "", exitCode: 118, failed: true, timedOut: true },
        false,
      ),
    ).toEqual({ id: "cygwin", success: false });
  });

  it("reads any other non-zero exit as a failure", () => {
    expect(interpretSetupExit(mkRun("", true), true)).toEqual({
      id: "cygwin",
      success: false,
    });
    expect(interpretSetupExit(mkRun("", true), false)).toEqual({
      id: "cygwin",
      success: false,
    });
  });

  it("cannot trust a zero exit when setup may have self-elevated", () => {
    const res = interpretSetupExit(mkRun(""), false);
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/UAC/);
  });

  it("trusts a zero exit when gup itself was already elevated", () => {
    expect(interpretSetupExit(mkRun(""), true)).toEqual({ id: "cygwin", success: true });
  });
});

// ===========================================================================
// Cygwin — provider
// ===========================================================================

describe("CygwinProvider.isAvailable", () => {
  it("is Windows-only and never touches the filesystem elsewhere", async () => {
    existsOnly(CYGCHECK64);
    process.env["SystemDrive"] = "C:";
    for (const platform of ["linux", "darwin"] as const) {
      setPlatform(platform);
      await expect(new CygwinProvider().isAvailable()).resolves.toBe(false);
    }
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("uses cygcheck.exe as the marker, not the directory", async () => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    existsOnly(CYGCHECK64);
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith(CYGCHECK64);
  });

  it("ignores an empty tree left behind by an uninstall", async () => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    existsOnly(CYG64);
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(false);
  });

  it("honours an explicit CYGWIN_ROOT", async () => {
    setPlatform("win32");
    process.env["CYGWIN_ROOT"] = "E:\\cyg\\";
    existsOnly("E:\\cyg\\bin\\cygcheck.exe");
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(true);
  });

  it("accepts a tree installed at the root of a drive", async () => {
    setPlatform("win32");
    process.env["CYGWIN_ROOT"] = "D:/";
    existsOnly("D:\\bin\\cygcheck.exe");
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenNthCalledWith(1, "D:\\bin\\cygcheck.exe");
  });

  it("treats an existsSync throw as 'not there' rather than a scan failure", async () => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    existsSyncMock.mockImplementation(() => {
      throw new Error("EPERM");
    });
    await expect(new CygwinProvider().isAvailable()).resolves.toBe(false);
  });

  it("swallows a non-string env value instead of aborting provider detection", async () => {
    // detectAvailableProviders() awaits every provider under one Promise.all
    // with no per-provider catch, so a throw here would take the whole
    // detection pass down. process.env normally coerces to string; a replaced
    // object does not, which is the case findCygwinRoot must survive.
    setPlatform("win32");
    const scrubbed = { ...process.env };
    process.env = { ...scrubbed, CYGWIN_ROOT: 42 as unknown as string };
    const probe = new CygwinProvider().isAvailable();
    process.env = scrubbed;
    await expect(probe).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });
});

describe("CygwinProvider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    process.env["USERPROFILE"] = "C:\\Users\\me";
  });

  it("returns [] when no Cygwin tree is installed", async () => {
    await expect(new CygwinProvider().listOutdated()).resolves.toEqual([]);
  });

  it("surfaces a single refresh row naming the command it will run", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    await expect(new CygwinProvider().listOutdated()).resolves.toEqual([
      {
        id: "cygwin",
        name: "Cygwin (paquets)",
        current: "?",
        latest: "refresh",
        note: "setup-x86_64.exe -q -g",
      },
    ]);
  });

  it("says setup must be downloaded when it is nowhere to be found", async () => {
    existsOnly(CYGCHECK64);
    const rows = await new CygwinProvider().listOutdated();
    expect(rows[0]?.note).toBe("setup-x86_64.exe introuvable — à télécharger");
  });

  it("accepts a setup left in the profile's Downloads folder", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_DOWNLOADS);
    const rows = await new CygwinProvider().listOutdated();
    expect(rows[0]?.note).toBe("setup-x86_64.exe -q -g");
  });

  it("still emits the row when the setup probe itself throws", async () => {
    // The tree was found, so the row is real; only the installer lookup blew
    // up. Degrading to "download it" beats losing the provider's only row.
    existsSyncMock.mockImplementation((p: unknown) => {
      if (String(p) === CYGCHECK64) return true;
      throw new Error("EPERM");
    });
    const rows = await new CygwinProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe("setup-x86_64.exe introuvable — à télécharger");
  });

  it("returns [] off Windows without probing the filesystem", async () => {
    setPlatform("linux");
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    await expect(new CygwinProvider().listOutdated()).resolves.toEqual([]);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });
});

describe("CygwinProvider.update", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
    process.env["USERPROFILE"] = "C:\\Users\\me";
  });

  it("skips when no Cygwin tree is installed", async () => {
    const res = await new CygwinProvider().update("cygwin");
    expect(res).toEqual({
      id: "cygwin",
      success: false,
      skipped: true,
      message:
        "Racine Cygwin introuvable — définir CYGWIN_ROOT sur le dossier d'installation.",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips with a download hint when setup is missing", async () => {
    existsOnly(CYGCHECK64);
    const res = await new CygwinProvider().update("cygwin");
    expect(res.skipped).toBe(true);
    expect(res.message).toContain("https://cygwin.com/setup-x86_64.exe");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("runs setup unattended from its own directory, pinned to the detected root", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new CygwinProvider().update("cygwin")).resolves.toEqual({
      id: "cygwin",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith(SETUP_IN_ROOT, buildUpgradeArgs(CYG64), {
      cwd: CYG64,
    });
  });

  it("keeps setup's cache and log next to a Downloads-resident installer", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_DOWNLOADS);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new CygwinProvider().update("cygwin");
    expect(runInheritMock).toHaveBeenCalledWith(
      SETUP_IN_DOWNLOADS,
      buildUpgradeArgs(CYG64),
      { cwd: "C:\\Users\\me\\Downloads" },
    );
  });

  it("probes elevation before spawning, and warns when it could not", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(false);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CygwinProvider().update("cygwin");
    expect(isElevatedMock).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/UAC/);
  });

  it("turns an unspawnable setup into a failed outcome, not a throw", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    const res = await new CygwinProvider().update("cygwin");
    expect(res.success).toBe(false);
    expect(res.message).toBe(
      "Lancement de setup-x86_64.exe impossible : refusing to spawn",
    );
  });

  it("stringifies a non-Error rejection from the elevation probe", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockRejectedValueOnce("nope");
    const res = await new CygwinProvider().update("cygwin");
    expect(res.success).toBe(false);
    expect(res.message).toBe("Lancement de setup-x86_64.exe impossible : nope");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("ignores the package id — there is only one row", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CygwinProvider().update("whatever");
    expect(res.id).toBe("cygwin");
  });

  it("reports a non-zero setup exit as a failure", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CygwinProvider().update("cygwin")).resolves.toEqual({
      id: "cygwin",
      success: false,
    });
  });

  it("reports exit 118 as a success that needs a reboot", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: 118,
      failed: true,
    });
    const res = await new CygwinProvider().update("cygwin");
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/redémarrage/);
  });

  it("defers off Windows without probing the filesystem or spawning", async () => {
    setPlatform("linux");
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    const res = await new CygwinProvider().update("cygwin");
    expect(res).toMatchObject({ id: "cygwin", success: false, skipped: true });
    expect(existsSyncMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(isElevatedMock).not.toHaveBeenCalled();
  });
});

describe("CygwinProvider.updateAll", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["SystemDrive"] = "C:";
  });

  it("does nothing at all for an empty set", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    await expect(new CygwinProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("delegates the whole selection to the single setup run", async () => {
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(
      new CygwinProvider().updateAll([{ id: "cygwin", current: "?", latest: "refresh" }]),
    ).resolves.toEqual([{ id: "cygwin", success: true }]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("collapses several rows into the one setup run this provider has", async () => {
    // listOutdated only ever emits `cygwin`, but updateAll must not fan a
    // hand-built selection out into N unattended installer launches.
    existsOnly(CYGCHECK64, SETUP_IN_ROOT);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CygwinProvider().updateAll([
      { id: "cygwin", current: "?", latest: "refresh" },
      { id: "cygwin", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "cygwin", success: true }]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(isElevatedMock).toHaveBeenCalledTimes(1);
  });

  it("skips the whole selection when no Cygwin tree is installed", async () => {
    const res = await new CygwinProvider().updateAll([
      { id: "cygwin", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([
      expect.objectContaining({ id: "cygwin", success: false, skipped: true }),
    ]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Npackd — package-name guard
// ===========================================================================

describe("isSafeNpackdPackageName", () => {
  it("accepts a real reverse-domain Npackd id", () => {
    expect(isSafeNpackdPackageName("com.googlecode.windirstat.WinDirStat")).toBe(true);
    expect(isSafeNpackdPackageName("org.7-zip.SevenZIP64")).toBe(true);
  });

  it("refuses an empty name", () => {
    expect(isSafeNpackdPackageName("")).toBe(false);
  });

  it("refuses a leading dash, which NpackdCL would read as an option", () => {
    expect(isSafeNpackdPackageName("--version")).toBe(false);
    expect(isSafeNpackdPackageName("-x")).toBe(false);
  });

  it("refuses '..' the way Package::isValidName does", () => {
    expect(isSafeNpackdPackageName("com..example")).toBe(false);
    expect(isSafeNpackdPackageName("..")).toBe(false);
  });

  it("refuses whitespace and control characters", () => {
    expect(isSafeNpackdPackageName("com.example App")).toBe(false);
    expect(isSafeNpackdPackageName("com.example\tApp")).toBe(false);
    expect(isSafeNpackdPackageName("com.example\nApp")).toBe(false);
    expect(isSafeNpackdPackageName("com.example\u0000App")).toBe(false);
    expect(isSafeNpackdPackageName("com.example\u007fApp")).toBe(false);
  });
});

// ===========================================================================
// Npackd — parsers
// ===========================================================================

describe("parseNpackdUpdateable", () => {
  it("parses the documented search --json envelope", () => {
    const stdout = JSON.stringify({
      packages: [
        {
          name: "com.example.App",
          title: "App",
          installed: [{ version: "1.2.3", where: "C:\\Program Files\\App" }],
        },
      ],
    });
    expect(parseNpackdUpdateable(stdout)).toEqual([
      {
        id: "com.example.App",
        name: "App",
        current: "1.2.3",
        latest: "?",
        note: "version disponible non listée par ncl",
      },
    ]);
  });

  it("reports `?` for the installed version when `installed` is omitted", () => {
    const stdout = JSON.stringify({
      packages: [{ name: "com.example.App", title: "App" }],
    });
    expect(parseNpackdUpdateable(stdout)[0]?.current).toBe("?");
  });

  it("falls back to the id when the title is missing or blank", () => {
    const stdout = JSON.stringify({
      packages: [
        { name: "com.example.A" },
        { name: "com.example.B", title: "   " },
        { name: "com.example.C", title: 42 },
      ],
    });
    expect(parseNpackdUpdateable(stdout).map((r) => r.name)).toEqual([
      "com.example.A",
      "com.example.B",
      "com.example.C",
    ]);
  });

  it("picks the newest installed version, not the first — 1.25.4 beats 1.9.10", () => {
    const build = (versions: string[]): string =>
      JSON.stringify({
        packages: [
          { name: "p", installed: versions.map((version) => ({ version })) },
        ],
      });
    expect(parseNpackdUpdateable(build(["1.9.10", "1.25.4"]))[0]?.current).toBe("1.25.4");
    expect(parseNpackdUpdateable(build(["1.25.4", "1.9.10"]))[0]?.current).toBe("1.25.4");
    // Missing trailing segments count as 0.
    expect(parseNpackdUpdateable(build(["1.2", "1.2.1"]))[0]?.current).toBe("1.2.1");
    expect(parseNpackdUpdateable(build(["1.2.1", "1.2"]))[0]?.current).toBe("1.2.1");
    // Equal versions keep the first one.
    expect(parseNpackdUpdateable(build(["3.0", "3.0"]))[0]?.current).toBe("3.0");
    // A non-numeric segment falls back to a stable lexicographic order.
    expect(parseNpackdUpdateable(build(["1.a", "1.b"]))[0]?.current).toBe("1.b");
    expect(parseNpackdUpdateable(build(["1.b", "1.a"]))[0]?.current).toBe("1.b");
  });

  it("reports `?` for an empty installed array", () => {
    const stdout = JSON.stringify({ packages: [{ name: "p", installed: [] }] });
    expect(parseNpackdUpdateable(stdout)[0]?.current).toBe("?");
  });

  it("ignores malformed entries of the installed array", () => {
    const stdout = JSON.stringify({
      packages: [
        {
          name: "p",
          installed: [null, "1.0", { where: "C:\\x" }, { version: 5 }, { version: "" }],
        },
        { name: "q", installed: "not-an-array" },
      ],
    });
    expect(parseNpackdUpdateable(stdout).map((r) => r.current)).toEqual(["?", "?"]);
  });

  it("drops entries that carry no usable name", () => {
    const stdout = JSON.stringify({
      packages: [null, "string", 7, {}, { name: "" }, { name: "   " }, { name: 9 }, { name: "ok" }],
    });
    expect(parseNpackdUpdateable(stdout).map((r) => r.id)).toEqual(["ok"]);
  });

  it("returns [] for blank, non-JSON and structurally wrong payloads", () => {
    expect(parseNpackdUpdateable("")).toEqual([]);
    expect(parseNpackdUpdateable("   \n  ")).toEqual([]);
    expect(parseNpackdUpdateable("12 packages found")).toEqual([]);
    expect(parseNpackdUpdateable("[]")).toEqual([]);
    expect(parseNpackdUpdateable("{not json")).toEqual([]);
    expect(parseNpackdUpdateable(JSON.stringify({ other: 1 }))).toEqual([]);
    expect(parseNpackdUpdateable(JSON.stringify({ packages: "nope" }))).toEqual([]);
    expect(parseNpackdUpdateable(JSON.stringify({ packages: [] }))).toEqual([]);
  });
});

describe("parseNpackdBareSearch", () => {
  it("reads `<name> <title>` lines", () => {
    const stdout = [
      "com.googlecode.windirstat.WinDirStat WinDirStat",
      "org.7-zip.SevenZIP64 7-Zip 64 bit",
      "",
    ].join("\n");
    expect(parseNpackdBareSearch(stdout)).toEqual([
      {
        id: "com.googlecode.windirstat.WinDirStat",
        name: "WinDirStat",
        current: "?",
        latest: "?",
        note: "version disponible non listée par ncl",
      },
      {
        id: "org.7-zip.SevenZIP64",
        name: "7-Zip 64 bit",
        current: "?",
        latest: "?",
        note: "version disponible non listée par ncl",
      },
    ]);
  });

  it("falls back to the id when the line carries no title", () => {
    expect(parseNpackdBareSearch("com.example.App\r\n")[0]?.name).toBe("com.example.App");
  });

  it("skips blank lines and anything whose first token is not a valid name", () => {
    expect(parseNpackdBareSearch("\n\n  \n")).toEqual([]);
    expect(parseNpackdBareSearch("--help is not a package")).toEqual([]);
    expect(parseNpackdBareSearch("com..broken Title")).toEqual([]);
  });
});

// ===========================================================================
// Npackd — provider
// ===========================================================================

const NPACKD_JSON = JSON.stringify({
  packages: [
    {
      name: "com.googlecode.windirstat.WinDirStat",
      title: "WinDirStat",
      installed: [{ version: "1.1.2", where: "C:\\Program Files\\WinDirStat" }],
    },
  ],
});

const EXPECTED_NPACKD_ROW: OutdatedPackage = {
  id: "com.googlecode.windirstat.WinDirStat",
  name: "WinDirStat",
  current: "1.1.2",
  latest: "?",
  note: "version disponible non listée par ncl",
};

// Spelled out rather than imported: these strings are the user-facing contract,
// so a reworded constant must fail here instead of silently agreeing with itself.
const NOT_ADMIN_MESSAGE =
  "Npackd installe à l'échelle du système par défaut : relancer gup depuis un terminal « Exécuter en tant qu'administrateur ».";

const INVALID_ID_MESSAGE =
  "Nom de paquet Npackd invalide (espace, « .. », tiret initial ou caractère de contrôle) — mise à jour à lancer à la main.";

describe("NpackdProvider.isAvailable", () => {
  it("is Windows-only — `ncl` is the NCAR Command Language elsewhere", async () => {
    commandExistsMock.mockResolvedValue(true);
    for (const platform of ["linux", "darwin"] as const) {
      setPlatform(platform);
      await expect(new NpackdProvider().isAvailable()).resolves.toBe(false);
    }
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("prefers the short `ncl` name", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new NpackdProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledTimes(1);
    expect(commandExistsMock).toHaveBeenCalledWith("ncl");
  });

  it("falls back to the historical `npackdcl`", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(new NpackdProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenNthCalledWith(2, "npackdcl");
  });

  it("is unavailable when neither name is on PATH", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(false);
    await expect(new NpackdProvider().isAvailable()).resolves.toBe(false);
  });

  it("treats a throwing probe as 'not installed'", async () => {
    setPlatform("win32");
    commandExistsMock.mockRejectedValue(new Error("refusing to spawn"));
    await expect(new NpackdProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("NpackdProvider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("win32");
  });

  it("returns [] without spawning when NpackdCL is absent", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("queries `search --status updateable --json` and keeps the rows as-is when elevated", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(NPACKD_JSON));
    isElevatedMock.mockResolvedValueOnce(true);
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([
      EXPECTED_NPACKD_ROW,
    ]);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith("ncl", [
      "search",
      "--status",
      "updateable",
      "--json",
    ]);
  });

  it("flags the rows for the CLI's single UAC prompt when not elevated", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(NPACKD_JSON));
    isElevatedMock.mockResolvedValueOnce(false);
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([
      { ...EXPECTED_NPACKD_ROW, requiresAdmin: true },
    ]);
  });

  it("treats an unknown elevation state as 'not admin'", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(NPACKD_JSON));
    isElevatedMock.mockRejectedValueOnce(new Error("net session failed"));
    const rows = await new NpackdProvider().listOutdated();
    expect(rows[0]?.requiresAdmin).toBe(true);
  });

  it("skips the elevation probe entirely when nothing is pending", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ packages: [] })));
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(isElevatedMock).not.toHaveBeenCalled();
  });

  it("falls back to --bare-format when an older binary rejects --json", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock
      .mockResolvedValueOnce(mkRun("Unknown option: json", true))
      .mockResolvedValueOnce(mkRun("com.example.App App\n"));
    isElevatedMock.mockResolvedValueOnce(true);
    const rows = await new NpackdProvider().listOutdated();
    expect(runMock).toHaveBeenNthCalledWith(2, "ncl", [
      "search",
      "--status",
      "updateable",
      "--bare-format",
    ]);
    expect(rows).toEqual([
      {
        id: "com.example.App",
        name: "App",
        current: "?",
        latest: "?",
        note: "version disponible non listée par ncl",
      },
    ]);
  });

  it("returns [] when both query forms fail", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValue(mkRun("", true));
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(isElevatedMock).not.toHaveBeenCalled();
  });

  it("returns [] rather than throwing when ncl cannot be spawned at all", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockRejectedValue(new Error("refusing to spawn"));
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] on a malformed JSON payload instead of throwing", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock
      .mockResolvedValueOnce(mkRun("{ not json at all"))
      .mockResolvedValueOnce(mkRun("com.example.App App\n"));
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    // A zero exit means the binary understood `--json`, so its answer is
    // authoritative: --bare-format is the fallback for an *older* binary that
    // rejected the option, not a second opinion on a bad payload.
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(isElevatedMock).not.toHaveBeenCalled();
  });

  it("flags the --bare-format fallback rows for UAC too", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock
      .mockResolvedValueOnce(mkRun("Unknown option: json", true))
      .mockResolvedValueOnce(mkRun("com.example.App App\n"));
    isElevatedMock.mockResolvedValueOnce(false);
    const rows = await new NpackdProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "com.example.App", requiresAdmin: true });
  });

  it("queries through the historical `npackdcl` name when `ncl` is absent", async () => {
    commandExistsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun(NPACKD_JSON));
    isElevatedMock.mockResolvedValueOnce(true);
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([
      EXPECTED_NPACKD_ROW,
    ]);
    expect(runMock).toHaveBeenCalledWith("npackdcl", [
      "search",
      "--status",
      "updateable",
      "--json",
    ]);
  });

  it("returns [] off Windows without probing the PATH", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValue(true);
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe("NpackdProvider.update", () => {
  beforeEach(() => {
    setPlatform("win32");
  });

  it("runs one non-interactive `update --package <id>`", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new NpackdProvider().update("com.example.App")).resolves.toEqual({
      id: "com.example.App",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("ncl", [
      "update",
      "--non-interactive",
      "--package",
      "com.example.App",
    ]);
  });

  it("reports a non-zero NpackdCL exit as a failure", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NpackdProvider().update("com.example.App")).resolves.toEqual({
      id: "com.example.App",
      success: false,
    });
  });

  it("turns an unspawnable NpackdCL into a failed outcome, not a throw", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    await expect(new NpackdProvider().update("com.example.App")).resolves.toEqual({
      id: "com.example.App",
      success: false,
      message: "Impossible de lancer NpackdCL pour cette mise à jour.",
    });
  });

  it("skips with a UAC hint when gup is not elevated", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(false);
    const res = await new NpackdProvider().update("com.example.App");
    expect(res).toMatchObject({ success: false, skipped: true });
    expect(res.message).toMatch(/administrateur/);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips when NpackdCL disappeared between the scan and the update", async () => {
    commandExistsMock.mockResolvedValue(false);
    const res = await new NpackdProvider().update("com.example.App");
    expect(res).toEqual({
      id: "com.example.App",
      success: false,
      skipped: true,
      message: "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("refuses an unsafe id before resolving the binary", async () => {
    const res = await new NpackdProvider().update("--version");
    expect(res).toMatchObject({ id: "--version", success: false, skipped: true });
    expect(res.message).toMatch(/invalide/);
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("NpackdProvider.updateAll", () => {
  beforeEach(() => {
    setPlatform("win32");
  });

  it("does nothing at all for an empty set", async () => {
    await expect(new NpackdProvider().updateAll([])).resolves.toEqual([]);
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("plans the whole selection as a single dependency graph", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NpackdProvider().updateAll([row("a.b"), row("c.d")]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("ncl", [
      "update",
      "--non-interactive",
      "--package",
      "a.b",
      "--package",
      "c.d",
    ]);
    expect(res).toEqual([
      { id: "a.b", success: true },
      { id: "c.d", success: true },
    ]);
  });

  it("refuses only the bogus ids and keeps the input order", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NpackdProvider().updateAll([
      row("a.b"),
      row("-bogus"),
      row("c.d"),
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("ncl", [
      "update",
      "--non-interactive",
      "--package",
      "a.b",
      "--package",
      "c.d",
    ]);
    expect(res.map((o) => o.id)).toEqual(["a.b", "-bogus", "c.d"]);
    expect(res[1]).toMatchObject({ success: false, skipped: true });
    expect(res[0]?.success).toBe(true);
    expect(res[2]?.success).toBe(true);
  });

  it("spawns nothing when every id is refused", async () => {
    const res = await new NpackdProvider().updateAll([row("-a"), row("b c")]);
    expect(res).toEqual([
      expect.objectContaining({ id: "-a", skipped: true }),
      expect.objectContaining({ id: "b c", skipped: true }),
    ]);
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("propagates one batch failure to every valid id", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NpackdProvider().updateAll([row("a.b"), row("c.d")]);
    expect(res).toEqual([
      { id: "a.b", success: false },
      { id: "c.d", success: false },
    ]);
  });

  it("skips the whole batch with a UAC hint when gup is not elevated", async () => {
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(false);
    const res = await new NpackdProvider().updateAll([row("a.b"), row("c.d")]);
    expect(res).toEqual([
      {
        id: "a.b",
        success: false,
        skipped: true,
        message: NOT_ADMIN_MESSAGE,
      },
      {
        id: "c.d",
        success: false,
        skipped: true,
        message: NOT_ADMIN_MESSAGE,
      },
    ]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips the whole batch when NpackdCL vanished between scan and update", async () => {
    commandExistsMock.mockResolvedValue(false);
    const res = await new NpackdProvider().updateAll([row("a.b"), row("c.d")]);
    expect(res).toEqual([
      {
        id: "a.b",
        success: false,
        skipped: true,
        message: "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).",
      },
      {
        id: "c.d",
        success: false,
        skipped: true,
        message: "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).",
      },
    ]);
    expect(isElevatedMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("fails — never skips — the batch when the spawn itself is refused", async () => {
    // `skipped` means "nothing was attempted"; a refused spawn is a real
    // failure the user has to see, so the two must not be conflated.
    commandExistsMock.mockResolvedValue(true);
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    const res = await new NpackdProvider().updateAll([row("a.b"), row("c.d")]);
    expect(res).toEqual([
      {
        id: "a.b",
        success: false,
        message: "Impossible de lancer NpackdCL pour cette mise à jour.",
      },
      {
        id: "c.d",
        success: false,
        message: "Impossible de lancer NpackdCL pour cette mise à jour.",
      },
    ]);
    expect(res.every((o) => o.skipped === undefined)).toBe(true);
  });

  it("still refuses the bogus ids when the valid ones cannot be applied", async () => {
    commandExistsMock.mockResolvedValue(false);
    const res = await new NpackdProvider().updateAll([row("a.b"), row("-bogus")]);
    expect(res.map((o) => o.message)).toEqual([
      "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).",
      INVALID_ID_MESSAGE,
    ]);
  });

  it("defers off Windows rather than matching the NCAR `ncl` binary", async () => {
    setPlatform("linux");
    commandExistsMock.mockResolvedValue(true);
    const res = await new NpackdProvider().updateAll([row("a.b")]);
    expect(res).toEqual([
      {
        id: "a.b",
        success: false,
        skipped: true,
        message: "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).",
      },
    ]);
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});
