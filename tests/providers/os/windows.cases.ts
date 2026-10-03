import { ChocoProvider } from "../../../src/providers/os/choco.js";
import { ScoopProvider } from "../../../src/providers/os/scoop.js";
import { WingetProvider } from "../../../src/providers/os/winget.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * Windows package managers. Sample outputs are exported: the knowledge tests
 * of each provider start from the same nominal machine.
 */

// --- winget -----------------------------------------------------------------

export const WINGET_UPGRADE_ARGV = [
  "winget",
  "upgrade",
  "--include-unknown",
  "--accept-source-agreements",
];
export const WINGET_PIN_ARGV = ["winget", "pin", "list"];

/** `winget upgrade` on an English Windows, the totals line included. */
export const WINGET_UPGRADE_TABLE = [
  "Name                              Id                          Version       Available     Source",
  "-------------------------------------------------------------------------------------------------",
  "Microsoft Edge                    Microsoft.Edge              120.0.2210.91 121.0.2277.83 winget",
  "PowerToys                         Microsoft.PowerToys         0.75.0        0.76.0        winget",
  "Mystery App                       Mystery.App                 unknown       2.0.0         winget",
  "3 upgrades available.",
].join("\n");

/** `winget pin list`: the second column is the pinned id. */
export const WINGET_PIN_LIST = [
  "Name      Id                  Version Source Pin type",
  "-----------------------------------------------------",
  "PowerToys Microsoft.PowerToys 0.75.0  winget Pinning",
].join("\n");

export const WINGET_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { winget: `${WIN_HOME}\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe` },
  commands: [
    { argv: WINGET_UPGRADE_ARGV, stdout: WINGET_UPGRADE_TABLE },
    { argv: WINGET_PIN_ARGV, stdout: WINGET_PIN_LIST },
  ],
};

/** `winget upgrade --id <id>` as gup runs it, before any retry option. */
export function wingetUpgradeArgv(id: string): string[] {
  return [
    "winget",
    "upgrade",
    "--id",
    id,
    "--exact",
    "--silent",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--include-unknown",
  ];
}

const WINGET: ProviderContractCase = {
  create: () => new WingetProvider(),
  system: WINGET_MACHINE,
  outdated: [
    {
      id: "Microsoft.Edge",
      name: "Microsoft Edge",
      current: "120.0.2210.91",
      latest: "121.0.2277.83",
    },
    {
      id: "Microsoft.PowerToys",
      name: "PowerToys",
      current: "0.75.0",
      latest: "0.76.0",
      note: "pinned",
    },
    {
      id: "Mystery.App",
      name: "Mystery App",
      current: "unknown",
      latest: "2.0.0",
      note: "unknown version",
    },
  ],
  update: {
    packageId: "Microsoft.Edge",
    installs: [wingetUpgradeArgv("Microsoft.Edge")],
    // A failed upgrade is retried with --force, --uninstall-previous, then a reinstall.
    onFailure: { success: false, retryable: true },
  },
  updateAll: "per-package",
};

// --- scoop ------------------------------------------------------------------

/** `scoop status`, with a held app (Info column). */
export const SCOOP_STATUS = [
  "Scoop is up to date.",
  "",
  "Name      Installed Version  Latest Version  Missing Dependencies  Info",
  "----      -----------------  --------------  --------------------  ----",
  "gh        2.40.0             2.42.1",
  "nodejs    20.10.0            20.11.1",
  "yt-dlp    2023.12.30         2024.03.10                            Held package",
  "",
].join("\n");

export const SCOOP_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { scoop: `${WIN_HOME}\\scoop\\shims\\scoop.cmd` },
  commands: [{ argv: ["scoop", "status"], stdout: SCOOP_STATUS }],
};

const SCOOP: ProviderContractCase = {
  create: () => new ScoopProvider(),
  system: SCOOP_MACHINE,
  outdated: [
    { id: "gh", name: "gh", current: "2.40.0", latest: "2.42.1" },
    { id: "nodejs", name: "nodejs", current: "20.10.0", latest: "20.11.1" },
    {
      id: "yt-dlp",
      name: "yt-dlp",
      current: "2023.12.30",
      latest: "2024.03.10",
      note: "Held package",
    },
  ],
  update: { packageId: "gh", installs: [["scoop", "update", "gh"]] },
  updateAll: "one-batch",
  batchInstalls: [["scoop", "update", "*"]],
};

// --- chocolatey -------------------------------------------------------------

export const CHOCO_OUTDATED_ARGV = ["choco", "outdated", "-r", "--limit-output"];

/** `choco outdated -r --limit-output`: name|current|available|pinned. */
export const CHOCO_OUTDATED = "git|2.43.0|2.44.0|false\nvlc|3.0.18|3.0.20|true\n";

export const CHOCO_NOT_ADMIN_MESSAGE =
  "Chocolatey nécessite un terminal admin. Relancer gup depuis PowerShell ou Terminal lancé en « Exécuter en tant qu'administrateur ».";

/** A Chocolatey install; `elevated` says whether gup runs as administrator. */
export function chocoMachine(elevated: boolean): SystemSpec {
  return {
    platform: "win32",
    bin: { choco: "C:\\ProgramData\\chocolatey\\bin\\choco.exe" },
    commands: [{ argv: CHOCO_OUTDATED_ARGV, stdout: CHOCO_OUTDATED }],
    elevated,
  };
}

const CHOCO_ROWS = [
  { id: "git", name: "git", current: "2.43.0", latest: "2.44.0" },
  { id: "vlc", name: "vlc", current: "3.0.18", latest: "3.0.20", note: "pinned" },
];

const CHOCO_AS_ADMIN: ProviderContractCase = {
  scenario: "administrator",
  create: () => new ChocoProvider(),
  system: chocoMachine(true),
  outdated: CHOCO_ROWS,
  update: { packageId: "git", installs: [["choco", "upgrade", "git", "-y"]] },
  updateAll: "one-batch",
  batchInstalls: [["choco", "upgrade", "all", "-y"]],
};

/** Not elevated: rows join the CLI's single UAC batch, direct updates are skipped. */
const CHOCO_AS_USER: ProviderContractCase = {
  scenario: "regular user",
  create: () => new ChocoProvider(),
  system: chocoMachine(false),
  outdated: CHOCO_ROWS.map((row) => ({ ...row, requiresAdmin: true })),
  update: {
    packageId: "git",
    installs: [],
    outcome: { success: false, skipped: true, message: CHOCO_NOT_ADMIN_MESSAGE },
  },
  updateAll: "skipped",
};

export const windowsCases: readonly ProviderContractCase[] = [
  WINGET,
  SCOOP,
  CHOCO_AS_ADMIN,
  CHOCO_AS_USER,
];
