import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import type { OutdatedPackage } from "../../../src/core/types.js";
import {
  parsePkginList,
  parsePkginOutdated,
  parseUpgradeCandidates,
  PkginProvider,
} from "../../../src/providers/os/pkgin.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { CommandAnswer, SystemSpec } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  PKGIN_EQUAL_ARGV,
  PKGIN_LESSER,
  PKGIN_LESSER_ARGV,
  PKGIN_LIST,
  PKGIN_LIST_ARGV,
  PKGIN_MACHINE,
} from "./posix.cases.js";

/**
 * pkgin: an unprivileged join of the installed listing with the `<` one, an
 * empty remote catalogue told apart from an up-to-date machine, and writes
 * through sudo — with a second upgrade pass when the first one only updated
 * the package tools.
 */

const UPGRADE = ["sudo", "pkgin", "-y", "upgrade"];

function row(id: string): OutdatedPackage {
  return { id, current: "1", latest: "2" };
}

/** pkgin answering `list`, `-l "<" list` and, when given, `-l "=" list`. */
function pkginMachine(lesser: CommandAnswer, equal?: CommandAnswer): SystemSpec {
  return {
    ...PKGIN_MACHINE,
    commands: [
      { argv: PKGIN_LIST_ARGV, stdout: PKGIN_LIST },
      { argv: PKGIN_LESSER_ARGV, ...lesser },
      ...(equal ? [{ argv: PKGIN_EQUAL_ARGV, ...equal }] : []),
    ],
  };
}

describe("PkginProvider.isAvailable", () => {
  it("degrades to false when the probe throws", async () => {
    await system.load(PKGIN_MACHINE);
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("nope")));
    await expect(new PkginProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("PkginProvider.listOutdated", () => {
  it("caps each query at one minute — a summary refresh can hang them", async () => {
    await system.load(PKGIN_MACHINE);
    await new PkginProvider().listOutdated();
    expect(system.trace.spawns).toEqual([
      { mode: "run", argv: PKGIN_LIST_ARGV, shell: false, timeout: 60_000 },
      { mode: "run", argv: PKGIN_LESSER_ARGV, shell: false, timeout: 60_000 },
    ]);
  });

  it("leaves rows to update in place when gup already runs as root", async () => {
    await system.load({ ...PKGIN_MACHINE, elevated: true });
    const rows = await new PkginProvider().listOutdated();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((parsed) => parsed.requiresAdmin === undefined)).toBe(true);
  });

  it("asks nothing more when nothing is installed", async () => {
    await system.load({
      ...PKGIN_MACHINE,
      commands: [{ argv: PKGIN_LIST_ARGV, stdout: "\n  \n" }],
    });
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([PKGIN_LIST_ARGV]);
  });

  it("returns [] rather than throwing when the runner refuses pkgin", async () => {
    await system.load(PKGIN_MACHINE);
    system.inject({ on: "spawn", argv: PKGIN_LIST_ARGV, mode: "rejects" });
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
  });

  it("stays silent when the catalogue confirms everything is current", async () => {
    await system.load(
      pkginMachine({ stdout: "" }, { stdout: "bash-5.2.15 =    The GNU Bourne Again Shell" }),
    );
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([PKGIN_LIST_ARGV, PKGIN_LESSER_ARGV, PKGIN_EQUAL_ARGV]);
  });

  it("emits the refresh row when the remote catalogue is empty", async () => {
    await system.load(pkginMachine({ stdout: "" }, { stdout: "" }));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([
      {
        id: "pkgin:refresh",
        aggregate: true,
        name: "pkgin (catalogue distant)",
        current: "?",
        latest: "refresh",
        note: "catalogue distant vide — sudo pkgin -y upgrade le reconstruit",
        requiresAdmin: true,
      },
    ]);
  });

  it("degrades to silence, not to a false alarm, when the `=` probe fails", async () => {
    await system.load(pkginMachine({ stdout: "" }, { exitCode: 1 }));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("PkginProvider updates", () => {
  it("skips sudo when the process already is root", async () => {
    await system.load({ ...PKGIN_MACHINE, uid: 0 });
    await new PkginProvider().update("nginx");
    expect(installArgvs()).toEqual([["pkgin", "-y", "install", "nginx"]]);
  });

  it("falls back to sudo when getuid does not exist", async () => {
    await system.load(PKGIN_MACHINE);
    Reflect.deleteProperty(process, "getuid");
    await new PkginProvider().update("nginx");
    expect(installArgvs()).toEqual([["sudo", "pkgin", "-y", "install", "nginx"]]);
  });

  it("upgrades the whole tree for the refresh row", async () => {
    await system.load(PKGIN_MACHINE);
    await expect(new PkginProvider().update("pkgin:refresh")).resolves.toEqual({
      id: "pkgin:refresh",
      success: true,
    });
    expect(installArgvs()).toEqual([UPGRADE]);
  });

  it("turns a spawn the runner refuses into a failed outcome", async () => {
    await system.load(PKGIN_MACHINE);
    system.answerInstall({ rejects: true });
    await expect(new PkginProvider().update("nginx ")).resolves.toEqual({
      id: "nginx ",
      success: false,
    });
  });

  it("re-runs once when pkgin upgraded only the package tools", async () => {
    await system.load({
      ...PKGIN_MACHINE,
      commands: [
        {
          argv: PKGIN_LESSER_ARGV,
          afterInstall: { stdout: "nginx-1.26.2 <    Highly performant web server" },
        },
      ],
    });
    system.answerInstall({ exitCode: 0 }, { exitCode: 1 });
    await expect(new PkginProvider().updateAll([row("nginx")])).resolves.toEqual([
      { id: "nginx", success: false },
    ]);
    expect(installArgvs()).toEqual([UPGRADE, UPGRADE]);
  });

  it("never re-checks after a failed first pass", async () => {
    await system.load(PKGIN_MACHINE);
    system.answerInstall({ exitCode: 1 });
    await expect(new PkginProvider().updateAll([row("nginx")])).resolves.toEqual([
      { id: "nginx", success: false },
    ]);
    expect(probeArgvs()).toEqual([]);
  });

  it("treats a failed re-check as 'nothing pending'", async () => {
    await system.load({
      ...PKGIN_MACHINE,
      commands: [{ argv: PKGIN_LESSER_ARGV, afterInstall: { exitCode: 1 } }],
    });
    await expect(new PkginProvider().updateAll([row("nginx")])).resolves.toEqual([
      { id: "nginx", success: true },
    ]);
    expect(installArgvs()).toEqual([UPGRADE]);
  });
});

describe("pkgin parsers", () => {
  it("parsePkginList splits a pkgsrc full name on its last dash", () => {
    const installed = parsePkginList(
      [
        "mysql-server-5.6.1nb2 MySQL 5.6, a free SQL database (server)",
        "py311-setuptools-63.1.0 New Python packaging system",
      ].join("\n"),
    );
    expect(installed.get("mysql-server")).toBe("5.6.1nb2");
    expect(installed.get("py311-setuptools")).toBe("63.1.0");
  });

  it("parsePkginList drops anything that is not a package line", () => {
    const installed = parsePkginList(
      ["", "   ", "empty local package list.", "-1.0", "nodash", "reading-local-summary"].join("\n"),
    );
    expect(installed.size).toBe(0);
  });

  it("parseUpgradeCandidates keeps only the `<` rows", () => {
    expect(parseUpgradeCandidates(PKGIN_LESSER).map((entry) => entry.name)).toEqual([
      "nginx",
      "php",
      "php",
      "unbound",
    ]);
  });

  it("parseUpgradeCandidates ignores other status flags and headers", () => {
    const stdout = [
      "bash-5.2.15 =    The GNU Bourne Again Shell",
      "cvs-1.12.13 >    Concurrent Versions System",
      "reading local summary...",
      "",
    ].join("\n");
    expect(parseUpgradeCandidates(stdout)).toEqual([]);
  });

  it("parseUpgradeCandidates accepts the semicolon-separated form", () => {
    expect(parseUpgradeCandidates("nginx-1.26.2;<;Highly performant web server")).toEqual([
      { name: "nginx", version: "1.26.2" },
    ]);
  });

  it("parseUpgradeCandidates drops a flagged row whose first token is no package", () => {
    expect(parseUpgradeCandidates("notapackage <   a description")).toEqual([]);
  });

  it("parsePkginOutdated keeps the highest of several candidates", () => {
    const rows = parsePkginOutdated(PKGIN_LIST, PKGIN_LESSER);
    expect(rows.map((parsed) => parsed.id)).toEqual(["nginx", "php"]);
    expect(rows[1]).toMatchObject({ current: "8.1.0", latest: "8.3.1" });
  });

  it("parsePkginOutdated orders 1.10 above 1.9 when picking a candidate", () => {
    const rows = parsePkginOutdated(
      "foo-1.8 A package",
      ["foo-1.10 <   A package", "foo-1.9 <    A package"].join("\n"),
    );
    expect(rows).toEqual([
      {
        id: "foo",
        name: "foo",
        current: "1.8",
        latest: "1.10",
        note: "2 candidates — preferred.conf peut en imposer une autre",
      },
    ]);
  });

  it("parsePkginOutdated ranks a release above its own release candidate", () => {
    const rows = parsePkginOutdated(
      "foo-1.9 A package",
      ["foo-2.0rc1 <  A package", "foo-2.0 <     A package"].join("\n"),
    );
    expect(rows[0]?.latest).toBe("2.0");
  });

  it("parsePkginOutdated ranks a longer version vector above its prefix", () => {
    const rows = parsePkginOutdated(
      "foo-1.9 A package",
      ["foo-1.10 <    A package", "foo-1.10.1 <  A package"].join("\n"),
    );
    expect(rows[0]?.latest).toBe("1.10.1");
  });

  it("parsePkginOutdated reads PKGREVISION as an extra component, not a rank", () => {
    const rows = parsePkginOutdated(
      "foo-1.0 A package",
      ["foo-1.0nb2 <  A package", "foo-1.0nb1 <  A package"].join("\n"),
    );
    expect(rows[0]?.latest).toBe("1.0nb2");
  });

  it("parsePkginOutdated keeps the first of two identical candidates", () => {
    const rows = parsePkginOutdated(
      "foo-1.0 A package",
      ["foo-2.0 <  A package", "foo-2.0 <  A package"].join("\n"),
    );
    expect(rows).toEqual([
      {
        id: "foo",
        name: "foo",
        current: "1.0",
        latest: "2.0",
        note: "2 candidates — preferred.conf peut en imposer une autre",
      },
    ]);
  });

  it("parsePkginOutdated drops a candidate equal to the installed build", () => {
    expect(parsePkginOutdated(PKGIN_LIST, "nginx-1.24.0 <  Web server")).toEqual([]);
  });

  it("parsePkginOutdated ignores a candidate that is not installed", () => {
    expect(parsePkginOutdated(PKGIN_LIST, "unbound-1.19.0 <  DNS resolver")).toEqual([]);
  });

  it("parsePkginOutdated is empty on blank input", () => {
    expect(parsePkginOutdated("", "")).toEqual([]);
  });
});
