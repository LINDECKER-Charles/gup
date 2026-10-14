import { describe, expect, it } from "vitest";
import type { OutdatedPackage, UpdateOutcome } from "../../../src/core/types.js";
import { BrewCaskProvider } from "../../../src/providers/os/brew-cask.js";
import { BrewProvider, parseBrewOutdated } from "../../../src/providers/os/brew.js";
import { system } from "../../support/system/fake-system.js";
import { installs } from "../../support/system/trace.js";
import { BREW_FORMULAE_JSON, BREW_MACHINE } from "./posix.cases.js";

/**
 * Homebrew formulae and casks share one `brew outdated --json=v2` envelope:
 * one side per provider, the active keg last, and a payload garbled by a
 * broken install degrades to no rows. Their upgrades never stop on
 * Homebrew's confirmation.
 */

const ROW: OutdatedPackage = { id: "dotnet", name: "dotnet", current: "10.0.401", latest: "10.0.401_1" };

describe("Homebrew upgrades", () => {
  // Homebrew 6.0 asks "Do you want to proceed with the upgrade? [y/n]" before
  // an upgrade that also moves another package (dotnet pulling powershell),
  // and the embedded terminal lets it ask: the row checked in gup is the answer.
  it.each<[string, () => Promise<UpdateOutcome | UpdateOutcome[]>, string[]]>([
    ["a formula", () => new BrewProvider().update("dotnet"), ["brew", "upgrade", "--formula", "dotnet"]],
    ["every formula", () => new BrewProvider().updateAll([ROW]), ["brew", "upgrade", "--formula"]],
    ["a cask", () => new BrewCaskProvider().update("dotnet-sdk"), ["brew", "upgrade", "--cask", "dotnet-sdk"]],
    ["every cask", () => new BrewCaskProvider().updateAll([ROW]), ["brew", "upgrade", "--cask"]],
  ])("never lets %s wait on Homebrew's confirmation", async (_label, update, argv) => {
    await system.load(BREW_MACHINE);
    await update();
    expect(installs()).toEqual([
      { mode: "inherit", argv, shell: false, env: { HOMEBREW_NO_ASK: "1" } },
    ]);
  });
});

describe("parseBrewOutdated", () => {
  it("takes the highest installed keg when several are present", () => {
    const rows = parseBrewOutdated(BREW_FORMULAE_JSON, "formulae");
    expect(rows.find((row) => row.id === "php@8.3")?.current).toBe("8.3.32");
  });

  it("drops entries missing a name or a version instead of emitting junk", () => {
    const payload = JSON.stringify({
      formulae: [
        { installed_versions: ["1.0"], current_version: "2.0" },
        { name: "nope", installed_versions: ["1.0"] },
        { name: "nada", current_version: "2.0" },
        { name: "ok", installed_versions: ["1.0"], current_version: "2.0" },
      ],
    });
    expect(parseBrewOutdated(payload, "formulae")).toEqual([
      { id: "ok", name: "ok", current: "1.0", latest: "2.0" },
    ]);
  });

  it("returns [] when the requested side of the envelope is absent or not a list", () => {
    expect(parseBrewOutdated(JSON.stringify({ formulae: [] }), "casks")).toEqual([]);
    expect(parseBrewOutdated(JSON.stringify({ casks: "nope" }), "casks")).toEqual([]);
  });

  it("returns [] rather than throwing on a payload that is not JSON", () => {
    expect(parseBrewOutdated("==> Auto-updating Homebrew...", "formulae")).toEqual([]);
  });
});
