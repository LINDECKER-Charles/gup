import { describe, expect, it } from "vitest";
import type { OutdatedPackage, UpdateOutcome } from "../../../src/core/types.js";
import { BrewCaskProvider } from "../../../src/providers/os/brew-cask.js";
import { BrewProvider, parseBrewOutdated } from "../../../src/providers/os/brew.js";
import { useLocale } from "../../support/locale.js";
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

/**
 * What the embedded terminal kept of a formula with no bottle, on a macOS its
 * Command Line Tools predate (Homebrew's `check_if_supported_sdk_available`).
 */
const CLT_UNSUPPORTED = [
  "==> Upgrading 1 outdated package:",
  "symfony-cli/tap/symfony-cli 5.20.0 -> 5.22.1",
  "Error: Your Command Line Tools (CLT) does not support macOS 27.",
  "It is either outdated or was modified.",
  "Please update your Command Line Tools (CLT) or delete it if no updates are available.",
  "Update them from Software Update in System Settings.",
].join("\n");

const CLT_REINSTALL = "sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install";

describe("Homebrew's build tools stopping an upgrade", () => {
  async function upgradeFailing(output: string): Promise<UpdateOutcome> {
    await system.load(BREW_MACHINE);
    system.answerInstall({ exitCode: 1, output });
    return new BrewProvider().update("symfony-cli/tap/symfony-cli");
  }

  it("ends as the manual action that fixes the Command Line Tools, never as a failure to retry", async () => {
    await expect(upgradeFailing(CLT_UNSUPPORTED)).resolves.toEqual({
      id: "symfony-cli/tap/symfony-cli",
      success: false,
      skipped: true,
      message:
        "Homebrew doit le compiler depuis les sources, et les Command Line Tools ne prennent pas en charge macOS 27 : " +
        `les mettre à jour depuis Mise à jour de logiciels dans Réglages Système, ou les réinstaller : ${CLT_REINSTALL}`,
    });
  });

  it("recognises Homebrew's line when a narrow pane cut it into screen rows", async () => {
    const cutInAWord = "Error: Your Command Line Tools (CLT) does not sup\nport macOS 2\n7.";
    const cutAtASpace = "Error: Your Command Line Tools (CLT) does not support\nmacOS 27.";
    for (const output of [cutInAWord, cutAtASpace]) {
      const outcome = await upgradeFailing(output);
      expect(outcome).toMatchObject({ skipped: true });
      expect(outcome.message).toContain("macOS 27 :");
    }
  });

  it.each([
    ["Error: Your Command Line Tools are too outdated.", "les Command Line Tools sont trop anciens"],
    ["Error: Your Xcode (16.4) at /Applications/Xcode.app is too outdated.", "Xcode est trop ancien pour ce macOS"],
    ["Error: Your Xcode does not support macOS 27.", "Xcode est trop ancien pour ce macOS"],
    ["Error: No developer tools installed.", "lancer xcode-select --install"],
    ["Error: Xcode alone is not sufficient on Tahoe.", "lancer xcode-select --install"],
    ["Error: You have not agreed to the Xcode license.", "lancer sudo xcodebuild -license"],
  ])("names the fix for %j", async (output, fix) => {
    const outcome = await upgradeFailing(output);
    expect(outcome).toMatchObject({ success: false, skipped: true });
    expect(outcome.message).toContain(fix);
  });

  it("leaves any other failure a plain failure, for the installer's line to explain", async () => {
    await expect(upgradeFailing("Error: Cannot install jq because conflicting formulae are installed.")).resolves.toEqual({
      id: "symfony-cli/tap/symfony-cli",
      success: false,
    });
  });

  it("stays a plain failure when the upgrade ran in the user's terminal, which keeps nothing", async () => {
    await system.load(BREW_MACHINE);
    system.answerInstall({ exitCode: 1 });
    await expect(new BrewProvider().update("jq")).resolves.toEqual({ id: "jq", success: false });
  });

  describe("in English", () => {
    useLocale("en");

    it("says the same in English", async () => {
      expect((await upgradeFailing(CLT_UNSUPPORTED)).message).toBe(
        "Homebrew must build it from source, and your Command Line Tools do not support macOS 27: " +
          `update them from Software Update in System Settings, or reinstall them: ${CLT_REINSTALL}`,
      );
    });
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
