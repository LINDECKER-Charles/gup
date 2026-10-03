import { ScoopProvider } from "../../../src/providers/os/scoop.js";
import { WingetProvider } from "../../../src/providers/os/winget.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import {
  SCOOP_MACHINE,
  WINGET_MACHINE,
  WINGET_PIN_ARGV,
  WINGET_UPGRADE_ARGV,
  wingetUpgradeArgv,
} from "./windows.cases.js";

/**
 * winget and scoop on their real output, recorded on a French Windows 11 by
 * `npm run fixtures:record` and neutralised (package names and ids replaced,
 * columns, versions and messages kept): the rows they make are goldens.
 */

const WINGET_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows (fr)",
  create: () => new WingetProvider(),
  system: {
    ...WINGET_MACHINE,
    commands: [
      { argv: WINGET_UPGRADE_ARGV, stdout: fixture("providers/os/winget/upgrade.win32.txt") },
      { argv: WINGET_PIN_ARGV, stdout: fixture("providers/os/winget/pin-list.win32.txt") },
    ],
  },
  outdated: golden("os", "winget.recorded.win32"),
  update: {
    packageId: "Vendor01.App01",
    installs: [wingetUpgradeArgv("Vendor01.App01")],
    onFailure: { success: false, retryable: true },
  },
  updateAll: "per-package",
};

const SCOOP_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows",
  create: () => new ScoopProvider(),
  system: {
    ...SCOOP_MACHINE,
    commands: [{ argv: ["scoop", "status"], stdout: fixture("providers/os/scoop/status.win32.txt") }],
  },
  outdated: golden("os", "scoop.recorded.win32"),
  update: { packageId: "tool-a", installs: [["scoop", "update", "tool-a"]] },
  updateAll: "one-batch",
  batchInstalls: [["scoop", "update", "*"]],
};

export const recordedOsCases: readonly ProviderContractCase[] = [WINGET_RECORDED, SCOOP_RECORDED];
