import { describe, expect, it } from "vitest";
import { parseScoopStatus, ScoopProvider } from "../../../src/providers/os/scoop.js";
import { system } from "../../support/system/fake-system.js";
import { installs } from "../../support/system/trace.js";
import { SCOOP_MACHINE } from "./windows.cases.js";

/**
 * Scoop prints a whitespace-aligned `status` table, and its command is a
 * `.cmd`/`.ps1` shim that only a shell can start — the one shell-routed
 * spawn gup allows, which is why the package id is validated first.
 */

const HEADER = [
  "Name      Installed Version  Latest Version  Missing Dependencies  Info",
  "----      -----------------  --------------  --------------------  ----",
];

function status(...rows: string[]): string {
  return [...HEADER, ...rows].join("\n");
}

describe("parseScoopStatus", () => {
  it("ignores an app whose installed version is the latest", () => {
    expect(parseScoopStatus(status("gh        2.42.1             2.42.1"))).toEqual([]);
  });

  it("returns [] when the header is absent", () => {
    expect(parseScoopStatus("Scoop is up to date.\n")).toEqual([]);
  });

  it("stops at the first blank line after the rows", () => {
    const output = status("gh        2.40.0             2.42.1", "", "something else entirely");
    expect(parseScoopStatus(output).map((row) => row.id)).toEqual(["gh"]);
  });

  it("skips a row that does not carry three columns", () => {
    const output = status("loner", "gh        2.40.0             2.42.1");
    expect(parseScoopStatus(output).map((row) => row.id)).toEqual(["gh"]);
  });
});

describe("ScoopProvider.update", () => {
  it("goes through scoop's shim with a shell, for one app and for the batch", async () => {
    await system.load(SCOOP_MACHINE);
    await new ScoopProvider().update("extras/with-dash_name");
    await new ScoopProvider().updateAll([{ id: "gh", current: "1", latest: "2" }]);
    expect(installs()).toEqual([
      { mode: "inherit", argv: ["scoop", "update", "extras/with-dash_name"], shell: true },
      { mode: "inherit", argv: ["scoop", "update", "*"], shell: true },
    ]);
  });

  it("refuses an id outside scoop's charset before any shell sees it", async () => {
    await system.load(SCOOP_MACHINE);
    for (const id of ["gh & calc", "gh;rm", "$(calc)", "a/b/c", ""]) {
      await expect(new ScoopProvider().update(id)).resolves.toEqual({
        id,
        success: false,
        message: `Identifiant de paquet Scoop invalide : ${id}`,
      });
    }
    expect(installs()).toEqual([]);
  });
});
