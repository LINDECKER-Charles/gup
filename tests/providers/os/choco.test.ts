import { describe, expect, it } from "vitest";
import { chocoOutcome, ChocoProvider, parseChocoOutdated } from "../../../src/providers/os/choco.js";
import { system } from "../../support/system/fake-system.js";
import { chocoMachine } from "./windows.cases.js";

/**
 * Chocolatey propagates the installer's exit code: the two Windows Installer
 * reboot codes are successes, everything else non-zero is a failure.
 */

const REBOOT_MESSAGE = "Mise à jour effectuée — redémarrage requis pour finaliser.";

describe("chocoOutcome", () => {
  it("treats exit 0 as a plain success", () => {
    expect(chocoOutcome("caddy", 0)).toEqual({ id: "caddy", success: true });
  });

  it("treats 3010 (reboot required) and 1641 (restart initiated) as successes", () => {
    for (const exitCode of [3010, 1641]) {
      expect(chocoOutcome("vcredist140", exitCode)).toEqual({
        id: "vcredist140",
        success: true,
        message: REBOOT_MESSAGE,
      });
    }
  });

  it("keeps every other non-zero exit a failure — 1603 is a real MSI failure", () => {
    for (const exitCode of [1603, 1, -1]) {
      expect(chocoOutcome("python312", exitCode)).toEqual({ id: "python312", success: false });
    }
  });
});

describe("ChocoProvider.updateAll", () => {
  it("says the batch needs a reboot once, on the first outcome only", async () => {
    await system.load(chocoMachine(true));
    system.answerInstall({ exitCode: 3010 });
    const outcomes = await new ChocoProvider().updateAll(
      ["caddy", "ffmpeg", "fzf"].map((id) => ({ id, current: "1", latest: "2" })),
    );
    expect(outcomes).toEqual([
      { id: "caddy", success: true, message: REBOOT_MESSAGE },
      { id: "ffmpeg", success: true },
      { id: "fzf", success: true },
    ]);
  });
});

describe("parseChocoOutdated", () => {
  it("skips Chocolatey's banner lines", () => {
    const stdout = "Chocolatey v2.2.2\nChocolatey upgraded 0/0 packages.\ngit|2.43.0|2.44.0|false\n";
    expect(parseChocoOutdated(stdout).map((row) => row.id)).toEqual(["git"]);
  });

  it("ignores a row whose current version is the available one", () => {
    expect(parseChocoOutdated("git|2.44.0|2.44.0|false\n")).toEqual([]);
  });

  it("ignores a malformed row missing fields", () => {
    expect(parseChocoOutdated("broken|only-two\n")).toEqual([]);
  });
});
