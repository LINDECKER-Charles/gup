import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import type { OutdatedPackage } from "../../../src/core/types.js";
import {
  NpackdProvider,
  parseNpackdBareSearch,
  parseNpackdUpdateable,
} from "../../../src/providers/os/npackd.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  NPACKD_BARE_ARGV,
  NPACKD_BIN,
  NPACKD_JSON,
  NPACKD_JSON_ARGV,
  NPACKD_NOT_ADMIN_MESSAGE,
  NPACKD_NOTE,
  npackdMachine,
} from "./windows.cases.js";

/**
 * Npackd: `ncl search --status updateable` (JSON, or the older bare format),
 * one `ncl update` for the whole selection, a guard on package names before
 * they reach NpackdCL's option parser, and no throw ever escaping a call.
 */

// Spelled out rather than imported: these strings are the user-facing contract.
const MISSING_CLI_MESSAGE = "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).";
const INVALID_ID_MESSAGE =
  "Nom de paquet Npackd invalide (espace, « .. », tiret initial ou caractère de contrôle) — mise à jour à lancer à la main.";
const SPAWN_FAILED_MESSAGE = "Impossible de lancer NpackdCL pour cette mise à jour.";

const APP = "com.example.App";

function row(id: string): OutdatedPackage {
  return { id, current: "1", latest: "2" };
}

/** `--json` rejected by an older NpackdCL, which then answers the bare format. */
function olderNpackd(elevated: boolean, bare: string): ReturnType<typeof npackdMachine> {
  return {
    ...npackdMachine(elevated),
    commands: [
      { argv: NPACKD_JSON_ARGV, stdout: "Unknown option: json", exitCode: 1 },
      { argv: NPACKD_BARE_ARGV, stdout: bare },
    ],
  };
}

describe("parseNpackdUpdateable", () => {
  it("reports `?` for the installed version when `installed` is omitted", () => {
    const stdout = JSON.stringify({ packages: [{ name: APP, title: "App" }] });
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
    expect(parseNpackdUpdateable(stdout).map((parsed) => parsed.name)).toEqual([
      "com.example.A",
      "com.example.B",
      "com.example.C",
    ]);
  });

  it("picks the newest installed version, not the first — 1.25.4 beats 1.9.10", () => {
    const newest = (versions: string[]): string | undefined =>
      parseNpackdUpdateable(
        JSON.stringify({ packages: [{ name: "p", installed: versions.map((version) => ({ version })) }] }),
      )[0]?.current;
    expect(newest(["1.9.10", "1.25.4"])).toBe("1.25.4");
    expect(newest(["1.25.4", "1.9.10"])).toBe("1.25.4");
    // Missing trailing segments count as 0.
    expect(newest(["1.2", "1.2.1"])).toBe("1.2.1");
    expect(newest(["1.2.1", "1.2"])).toBe("1.2.1");
    // Equal versions keep the first one.
    expect(newest(["3.0", "3.0"])).toBe("3.0");
    // A non-numeric segment falls back to a stable lexicographic order.
    expect(newest(["1.a", "1.b"])).toBe("1.b");
    expect(newest(["1.b", "1.a"])).toBe("1.b");
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
    expect(parseNpackdUpdateable(stdout).map((parsed) => parsed.current)).toEqual(["?", "?"]);
  });

  it("drops entries that carry no usable name", () => {
    const stdout = JSON.stringify({
      packages: [null, "string", 7, {}, { name: "" }, { name: "   " }, { name: 9 }, { name: "ok" }],
    });
    expect(parseNpackdUpdateable(stdout).map((parsed) => parsed.id)).toEqual(["ok"]);
  });

  it("returns [] for blank, non-JSON and structurally wrong payloads", () => {
    for (const stdout of [
      "",
      "   \n  ",
      "12 packages found",
      "[]",
      "{not json",
      JSON.stringify({ other: 1 }),
      JSON.stringify({ packages: "nope" }),
      JSON.stringify({ packages: [] }),
    ]) {
      expect(parseNpackdUpdateable(stdout)).toEqual([]);
    }
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
        note: NPACKD_NOTE,
      },
      { id: "org.7-zip.SevenZIP64", name: "7-Zip 64 bit", current: "?", latest: "?", note: NPACKD_NOTE },
    ]);
  });

  it("falls back to the id when the line carries no title", () => {
    expect(parseNpackdBareSearch(`${APP}\r\n`)[0]?.name).toBe(APP);
  });

  it("skips blank lines and anything whose first token is not a valid name", () => {
    expect(parseNpackdBareSearch("\n\n  \n")).toEqual([]);
    expect(parseNpackdBareSearch("--help is not a package")).toEqual([]);
    expect(parseNpackdBareSearch("com..broken Title")).toEqual([]);
  });
});

describe("NpackdProvider off Windows", () => {
  it.each<SimPlatform>(["linux", "darwin"])(
    "never matches the NCAR Command Language `ncl` on %s",
    async (platform) => {
      await system.load({ platform, bin: { ncl: "/usr/local/bin/ncl" } });
      const provider = new NpackdProvider();
      await expect(provider.isAvailable()).resolves.toBe(false);
      await expect(provider.listOutdated()).resolves.toEqual([]);
      await expect(provider.updateAll([row("a.b")])).resolves.toEqual([
        { id: "a.b", success: false, skipped: true, message: MISSING_CLI_MESSAGE },
      ]);
      expect(system.trace.spawns).toEqual([]);
    },
  );
});

describe("NpackdProvider binary resolution", () => {
  it("prefers the short `ncl` name when both are on PATH", async () => {
    await system.load({
      ...npackdMachine(true),
      bin: { ncl: NPACKD_BIN, npackdcl: "C:\\Program Files\\NpackdCL\\npackdcl.exe" },
    });
    await new NpackdProvider().listOutdated();
    expect(probeArgvs()).toEqual([NPACKD_JSON_ARGV]);
  });

  it("falls back to the historical `npackdcl` name", async () => {
    const legacyArgv = ["npackdcl", ...NPACKD_JSON_ARGV.slice(1)];
    await system.load({
      platform: "win32",
      bin: { npackdcl: "C:\\Program Files\\NpackdCL\\npackdcl.exe" },
      commands: [{ argv: legacyArgv, stdout: NPACKD_JSON }],
      elevated: true,
    });
    await expect(new NpackdProvider().isAvailable()).resolves.toBe(true);
    const rows = await new NpackdProvider().listOutdated();
    expect(rows.map((parsed) => parsed.id)).toEqual([
      "com.googlecode.windirstat.WinDirStat",
      "org.7-zip.SevenZIP64",
    ]);
  });

  it("treats a throwing PATH probe as 'not installed'", async () => {
    await system.load(npackdMachine(true));
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("refusing to spawn")));
    await expect(new NpackdProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("NpackdProvider.listOutdated", () => {
  it("returns [] without spawning when NpackdCL is absent", async () => {
    await system.load({ platform: "win32" });
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.spawns).toEqual([]);
  });

  it("treats an unknown elevation state as 'not admin'", async () => {
    await system.load(npackdMachine(true));
    replaceForTest(runner, "isElevated", () => Promise.reject(new Error("net session failed")));
    const rows = await new NpackdProvider().listOutdated();
    expect(rows.every((parsed) => parsed.requiresAdmin === true)).toBe(true);
  });

  it("skips the elevation probe entirely when nothing is pending", async () => {
    await system.load({
      ...npackdMachine(false),
      commands: [{ argv: NPACKD_JSON_ARGV, stdout: JSON.stringify({ packages: [] }) }],
    });
    const isElevated = replaceForTest(runner, "isElevated", () => Promise.resolve(false));
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(isElevated).not.toHaveBeenCalled();
  });

  it("falls back to --bare-format when an older binary rejects --json", async () => {
    await system.load(olderNpackd(true, `${APP} App\n`));
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([
      { id: APP, name: "App", current: "?", latest: "?", note: NPACKD_NOTE },
    ]);
    expect(probeArgvs()).toEqual([NPACKD_JSON_ARGV, NPACKD_BARE_ARGV]);
  });

  it("flags the --bare-format fallback rows for UAC too", async () => {
    await system.load(olderNpackd(false, `${APP} App\n`));
    const rows = await new NpackdProvider().listOutdated();
    expect(rows).toEqual([expect.objectContaining({ id: APP, requiresAdmin: true })]);
  });

  it("returns [] rather than throwing when the runner refuses both queries", async () => {
    await system.load(npackdMachine(true));
    system.inject({ on: "spawn", argv: NPACKD_JSON_ARGV, mode: "rejects" });
    system.inject({ on: "spawn", argv: NPACKD_BARE_ARGV, mode: "rejects" });
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
  });

  it("trusts a zero-exit --json answer, malformed or not — no second opinion", async () => {
    // --bare-format is for an older binary that rejected the option, not a
    // second opinion on a bad payload.
    await system.load({
      ...npackdMachine(true),
      commands: [{ argv: NPACKD_JSON_ARGV, stdout: "{ not json at all" }],
    });
    await expect(new NpackdProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([NPACKD_JSON_ARGV]);
  });
});

describe("NpackdProvider.update", () => {
  it("turns a NpackdCL the runner refuses into a failed outcome, not a throw", async () => {
    await system.load(npackdMachine(true));
    system.answerInstall({ rejects: true });
    await expect(new NpackdProvider().update(APP)).resolves.toEqual({
      id: APP,
      success: false,
      message: SPAWN_FAILED_MESSAGE,
    });
  });

  it("skips when NpackdCL disappeared between the scan and the update", async () => {
    await system.load({ platform: "win32", elevated: true });
    await expect(new NpackdProvider().update(APP)).resolves.toEqual({
      id: APP,
      success: false,
      skipped: true,
      message: MISSING_CLI_MESSAGE,
    });
  });

});

describe("NpackdProvider.updateAll", () => {
  it("refuses only the bogus ids and keeps the input order", async () => {
    await system.load(npackdMachine(true));
    const outcomes = await new NpackdProvider().updateAll([row("a.b"), row("-bogus"), row("c.d")]);
    expect(installArgvs()).toEqual([
      ["ncl", "update", "--non-interactive", "--package", "a.b", "--package", "c.d"],
    ]);
    expect(outcomes).toEqual([
      { id: "a.b", success: true },
      { id: "-bogus", success: false, skipped: true, message: INVALID_ID_MESSAGE },
      { id: "c.d", success: true },
    ]);
  });

  it("spawns nothing when every id is refused", async () => {
    await system.load(npackdMachine(true));
    const outcomes = await new NpackdProvider().updateAll([row("-a"), row("b c")]);
    expect(outcomes.map((outcome) => outcome.message)).toEqual([
      INVALID_ID_MESSAGE,
      INVALID_ID_MESSAGE,
    ]);
    expect(installArgvs()).toEqual([]);
  });

  it("skips the whole batch when NpackdCL vanished between scan and update", async () => {
    await system.load({ platform: "win32", elevated: true });
    await expect(new NpackdProvider().updateAll([row("a.b"), row("c.d")])).resolves.toEqual([
      { id: "a.b", success: false, skipped: true, message: MISSING_CLI_MESSAGE },
      { id: "c.d", success: false, skipped: true, message: MISSING_CLI_MESSAGE },
    ]);
  });

  it("skips the whole batch with a UAC hint when gup is not elevated", async () => {
    await system.load(npackdMachine(false));
    await expect(new NpackdProvider().updateAll([row("a.b"), row("c.d")])).resolves.toEqual([
      { id: "a.b", success: false, skipped: true, message: NPACKD_NOT_ADMIN_MESSAGE },
      { id: "c.d", success: false, skipped: true, message: NPACKD_NOT_ADMIN_MESSAGE },
    ]);
    expect(installArgvs()).toEqual([]);
  });

  it("fails — never skips — the batch when the spawn itself is refused", async () => {
    // `skipped` means "nothing was attempted"; a refused spawn is a real failure.
    await system.load(npackdMachine(true));
    system.answerInstall({ rejects: true });
    await expect(new NpackdProvider().updateAll([row("a.b"), row("c.d")])).resolves.toEqual([
      { id: "a.b", success: false, message: SPAWN_FAILED_MESSAGE },
      { id: "c.d", success: false, message: SPAWN_FAILED_MESSAGE },
    ]);
  });

  it("still refuses the bogus ids when the valid ones cannot be applied", async () => {
    await system.load({ platform: "win32", elevated: true });
    const outcomes = await new NpackdProvider().updateAll([row("a.b"), row("-bogus")]);
    expect(outcomes.map((outcome) => outcome.message)).toEqual([
      MISSING_CLI_MESSAGE,
      INVALID_ID_MESSAGE,
    ]);
  });
});
