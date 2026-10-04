import { describe, expect, it } from "vitest";
import { setActiveLocale } from "../../../src/core/i18n/locale.js";
import { parseWingetTable, WingetProvider } from "../../../src/providers/os/winget.js";
import { SUITE_LOCALE } from "../../support/locale.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  WINGET_MACHINE,
  WINGET_PIN_ARGV,
  WINGET_UPGRADE_ARGV,
  wingetUpgradeArgv,
} from "./windows.cases.js";

/**
 * winget has no machine-readable `upgrade` output: gup slices its fixed-width
 * table by header offsets, in English and French, across the two tables it
 * prints, and walks a ladder of retry options when an upgrade fails.
 */

const HEADER_EN =
  "Name                              Id                          Version       Available     Source";
const SEPARATOR =
  "-------------------------------------------------------------------------------------------------";

function table(...rows: string[]): string {
  return [HEADER_EN, SEPARATOR, ...rows].join("\n");
}

const EDGE_ROW =
  "Microsoft Edge                    Microsoft.Edge              120.0.2210.91 121.0.2277.83 winget";

const POWERTOYS_ROW =
  "PowerToys                         Microsoft.PowerToys         0.75.0        0.76.0        winget";

const FR_TABLE = [
  "Nom                               Id                          Version       Disponible    Source",
  SEPARATOR,
  "Google Chrome                     Google.Chrome               120.0.6099.71 121.0.6167.85 winget",
  "Git                               Git.Git                     2.43.0        2.44.0        winget",
  "2 mises à jour disponibles.",
].join("\n");

/** A machine whose `winget upgrade` prints `stdout` (and exits `exitCode`) and pins nothing. */
async function loadUpgradeOutput(stdout: string, exitCode = 0): Promise<void> {
  await system.load({
    ...WINGET_MACHINE,
    commands: [
      { argv: WINGET_UPGRADE_ARGV, stdout, exitCode },
      { argv: WINGET_PIN_ARGV, stdout: "" },
    ],
  });
}

describe("parseWingetTable", () => {
  it("parses the English column layout", () => {
    expect(parseWingetTable(`${table(EDGE_ROW)}\n12 upgrades available.`)).toEqual([
      {
        name: "Microsoft Edge",
        id: "Microsoft.Edge",
        version: "120.0.2210.91",
        available: "121.0.2277.83",
      },
    ]);
  });

  it("parses the French column layout (Nom / Disponible)", () => {
    const rows = parseWingetTable(FR_TABLE);
    expect(rows.map((row) => row.id)).toEqual(["Google.Chrome", "Git.Git"]);
    expect(rows[0]?.name).toBe("Google Chrome");
    expect(rows[1]?.available).toBe("2.44.0");
  });

  it("never turns a French summary line into a package row", () => {
    // The end-of-table guard once held a double-encoded `à`, so on a French
    // Windows the summary fell through to the column slicer.
    for (const summary of [
      "2 mises à jour disponibles.",
      "2 mises à niveau disponibles.",
      "1 mise à niveau disponible.",
    ]) {
      const rows = parseWingetTable(FR_TABLE.replace("2 mises à jour disponibles.", summary));
      expect(rows.map((row) => row.id)).toEqual(["Google.Chrome", "Git.Git"]);
    }
  });

  it("parses BOTH tables when winget adds the explicit-targeting section", () => {
    const output = [
      table(EDGE_ROW),
      "",
      "The following packages have pinned versions and require explicit targeting:",
      table(POWERTOYS_ROW),
    ].join("\n");
    expect(parseWingetTable(output).map((row) => row.id)).toEqual([
      "Microsoft.Edge",
      "Microsoft.PowerToys",
    ]);
  });

  it("does not glue spinner carriage-return frames onto the header", () => {
    const rows = parseWingetTable(`\r-\r\\\r|\r${table(EDGE_ROW)}`);
    expect(rows.map((row) => row.id)).toEqual(["Microsoft.Edge"]);
  });

  it("deduplicates a package listed in both tables", () => {
    expect(parseWingetTable(`${table(EDGE_ROW)}\n\n${table(EDGE_ROW)}`)).toHaveLength(1);
  });

  it("returns [] when no header is present", () => {
    expect(parseWingetTable("garbage output\nfoo bar")).toEqual([]);
  });

  it("refuses a header that is not followed by a separator line", () => {
    expect(parseWingetTable([HEADER_EN, "not a separator", EDGE_ROW].join("\n"))).toEqual([]);
  });

  it("refuses a header missing one of the required columns", () => {
    const withoutVersion = [
      "Name      Id       Available  Source",
      "---------",
      "Foo       Foo.Bar  2.0.0      winget",
    ].join("\n");
    expect(parseWingetTable(withoutVersion)).toEqual([]);
  });

  it("reads a table without a Source column up to the end of the line", () => {
    const withoutSource = [
      "Name                              Id                          Version       Available",
      SEPARATOR,
      "Real.Row                          Real.Row.Id                 1.0.0         2.0.0",
    ].join("\n");
    expect(parseWingetTable(withoutSource)).toEqual([
      { name: "Real.Row", id: "Real.Row.Id", version: "1.0.0", available: "2.0.0" },
    ]);
  });
});

describe("WingetProvider.listOutdated", () => {
  it("falls back to the id when the Name column is blank", async () => {
    await loadUpgradeOutput(
      table(
        "                                  Some.Package                1.0.0         2.0.0         winget",
      ),
    );
    const rows = await new WingetProvider().listOutdated();
    expect(rows).toEqual([
      { id: "Some.Package", name: "Some.Package", current: "1.0.0", latest: "2.0.0" },
    ]);
  });

  it("reports `?` as the current version when the Version column is blank", async () => {
    await loadUpgradeOutput(
      table(
        "Edge                              Microsoft.Edge                            2.0.0         winget",
      ),
    );
    const rows = await new WingetProvider().listOutdated();
    expect(rows).toEqual([{ id: "Microsoft.Edge", name: "Edge", current: "?", latest: "2.0.0" }]);
  });

  it("keeps the rows winget printed before exiting non-zero", async () => {
    await loadUpgradeOutput(table(EDGE_ROW), 1);
    const rows = await new WingetProvider().listOutdated();
    expect(rows.map((row) => row.id)).toEqual(["Microsoft.Edge"]);
  });

  it("does not ask for pins when the upgrade probe failed without output", async () => {
    await loadUpgradeOutput("", 1);
    await expect(new WingetProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([WINGET_UPGRADE_ARGV]);
  });

  it("still lists a pinned package when the pin query fails, without the note", async () => {
    await system.load({
      ...WINGET_MACHINE,
      commands: [
        { argv: WINGET_UPGRADE_ARGV, stdout: table(POWERTOYS_ROW) },
        { argv: WINGET_PIN_ARGV, exitCode: 1 },
      ],
    });
    await expect(new WingetProvider().listOutdated()).resolves.toEqual([
      { id: "Microsoft.PowerToys", name: "PowerToys", current: "0.75.0", latest: "0.76.0" },
    ]);
  });
});

describe("WingetProvider.update", () => {
  const ID = "Some.Package";

  it("forbids prompts in an unattended run", async () => {
    await system.load(WINGET_MACHINE);
    await new WingetProvider().update(ID, { unattended: true });
    expect(installArgvs()).toEqual([[...wingetUpgradeArgv(ID), "--disable-interactivity"]]);
  });

  it("adds --force, then --uninstall-previous, on the retry tiers", async () => {
    await system.load(WINGET_MACHINE);
    await new WingetProvider().update(ID, { force: true });
    await new WingetProvider().update(ID, { uninstallPrevious: true });
    expect(installArgvs()).toEqual([
      [...wingetUpgradeArgv(ID), "--force"],
      [...wingetUpgradeArgv(ID), "--uninstall-previous"],
    ]);
  });

  it("reinstalls as uninstall then install, forced by default", async () => {
    await system.load(WINGET_MACHINE);
    const outcome = await new WingetProvider().update(ID, { reinstall: true });
    expect(outcome).toEqual({ id: ID, success: true });
    const target = ["--id", ID, "--exact", "--silent", "--accept-source-agreements"];
    expect(installArgvs()).toEqual([
      ["winget", "uninstall", ...target],
      [
        "winget",
        "install",
        ...target,
        "--accept-package-agreements",
        "--include-unknown",
        "--force",
      ],
    ]);
  });

  it("drops --force from the reinstall when force is explicitly off", async () => {
    await system.load(WINGET_MACHINE);
    await new WingetProvider().update(ID, { reinstall: true, force: false });
    expect(installArgvs()[1]).not.toContain("--force");
  });

  it("keeps both reinstall passes non-interactive in an unattended run", async () => {
    await system.load(WINGET_MACHINE);
    await new WingetProvider().update(ID, { reinstall: true, unattended: true });
    const argvs = installArgvs();
    expect(argvs).toHaveLength(2);
    for (const argv of argvs) expect(argv).toContain("--disable-interactivity");
  });

  it("installs even when the uninstall pass failed", async () => {
    await system.load(WINGET_MACHINE);
    system.answerInstall({ exitCode: 1 }, { exitCode: 0 });
    const outcome = await new WingetProvider().update(ID, { reinstall: true });
    expect(outcome).toEqual({ id: ID, success: true });
    expect(installArgvs()).toHaveLength(2);
  });

  it("reports a failed reinstall as final — nothing left to retry", async () => {
    await system.load(WINGET_MACHINE);
    system.answerInstall({ exitCode: 0 }, { exitCode: 1 });
    const outcome = await new WingetProvider().update(ID, { reinstall: true });
    expect(outcome).toEqual({ id: ID, success: false });
  });

  it.each([
    // The manifest forbids upgrades (Parsec, Android Studio).
    [0x8a150114, "winget ne peut pas mettre à jour ce paquet"],
    // winget asked for an install location it could not read (Battle.net).
    [0x8a150042, `lancer winget upgrade --id ${ID} dans un terminal`],
  ])("skips, with what to do, a failure winget says no retry can fix (%s)", async (code, text) => {
    await system.load(WINGET_MACHINE);
    system.answerInstall({ exitCode: code | 0 });
    const outcome = await new WingetProvider().update(ID);
    expect(outcome).toMatchObject({ id: ID, success: false, skipped: true });
    expect(outcome.retryable).toBeUndefined();
    expect(outcome.message).toContain(text);
  });

  it("speaks English when the interface does", async () => {
    await system.load(WINGET_MACHINE);
    system.answerInstall({ exitCode: 0x8a150114 | 0 });
    setActiveLocale("en");
    try {
      const outcome = await new WingetProvider().update(ID);
      expect(outcome.message).toBe(
        "winget cannot upgrade this package: use its publisher's own updater",
      );
    } finally {
      setActiveLocale(SUITE_LOCALE);
    }
  });

  it("keeps each package's own outcome in a batch", async () => {
    await system.load(WINGET_MACHINE);
    system.answerInstall({ exitCode: 0 }, { exitCode: 1 });
    const outcomes = await new WingetProvider().updateAll([
      { id: "A", current: "1", latest: "2" },
      { id: "B", current: "1", latest: "2" },
    ]);
    expect(outcomes).toEqual([
      { id: "A", success: true },
      { id: "B", success: false, retryable: true },
    ]);
  });
});
