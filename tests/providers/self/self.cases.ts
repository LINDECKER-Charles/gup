import type { OutdatedPackage } from "../../../src/core/types.js";
import { SelfProvider } from "../../../src/providers/self.js";
import { delegationRoutes, installedVia } from "../../support/contract/installers.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest, npmLatestRoute, pypiRoute } from "../../support/system/releases.js";
import type { CommandScript, SystemSpec } from "../../support/system/types.js";

/**
 * The self-updates of the package managers gup drives: one case per target,
 * each on a machine where that target is the only one on PATH, on a platform
 * it exists on. The machines a knowledge test starts from are exported; the
 * rest of the case data stays private.
 */

/** `<binary> --version` answering `stdout`. */
export function versionProbe(binary: string, stdout: string): CommandScript {
  return { argv: [binary, "--version"], stdout };
}

/** A self case: the provider on `system`, its single row, and that row's update. */
interface SelfCase {
  readonly system: SystemSpec;
  readonly row: readonly OutdatedPackage[];
  readonly update: NonNullable<ProviderContractCase["update"]>;
}

function selfCase(scenario: string, target: SelfCase): ProviderContractCase {
  const isSkipped = target.update.installs.length === 0;
  return {
    scenario,
    create: () => new SelfProvider(),
    system: target.system,
    outdated: target.row,
    update: target.update,
    updateAll: isSkipped ? "skipped" : "per-package",
  };
}

// --- Windows package managers ---------------------------------------------------

const WINGET_MANUAL_NOTE =
  "Mise à jour via le Microsoft Store (App Installer) ou https://github.com/microsoft/winget-cli/releases";

/** winget ships with App Installer: no CLI self-update, a manual row. */
const WINGET = selfCase("winget", {
  system: {
    platform: "win32",
    bin: { winget: "C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe" },
    commands: [versionProbe("winget", "v1.6.10121")],
    http: [githubLatest("microsoft/winget-cli", "v1.7.10861")],
  },
  row: [
    {
      id: "winget",
      name: "Winget",
      current: "1.6.10121",
      latest: "1.7.10861",
      manual: true,
      note: WINGET_MANUAL_NOTE,
    },
  ],
  update: {
    packageId: "winget",
    installs: [],
    outcome: {
      success: false,
      skipped: true,
      message: "Mise à jour via le Microsoft Store (App Installer) ou téléchargement manuel.",
    },
  },
});

export const SCOOP_SHIM = "C:\\Users\\u\\scoop\\shims\\scoop.cmd";

/** `scoop --version` prints scoop's own block first, then one per bucket. */
const SCOOP = selfCase("scoop", {
  system: {
    platform: "win32",
    bin: { scoop: SCOOP_SHIM },
    commands: [
      versionProbe(
        "scoop",
        [
          "Current Scoop version:",
          "v0.5.2 - Released at 2024-07-26",
          "",
          "'main' bucket:",
          "2c4a5b1e1 (HEAD -> master, origin/master) main@1.2.3: Update to version 1.2.3",
        ].join("\n"),
      ),
    ],
    http: [githubLatest("ScoopInstaller/Scoop", "v0.5.3")],
  },
  row: [{ id: "scoop", name: "Scoop", current: "0.5.2", latest: "0.5.3" }],
  // Through the shell: scoop is a PowerShell shim (shell-usage allowlist).
  update: { packageId: "scoop", installs: [["scoop", "update"]] },
});

/** Chocolatey upgrades itself system-wide, from an elevated gup. */
export const CHOCO_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { choco: "C:\\ProgramData\\chocolatey\\bin\\choco.exe" },
  commands: [versionProbe("choco", "2.2.2")],
  http: [githubLatest("chocolatey/choco", "2.3.0")],
  elevated: true,
};

const CHOCO = selfCase("choco", {
  system: CHOCO_MACHINE,
  row: [{ id: "choco", name: "Chocolatey", current: "2.2.2", latest: "2.3.0" }],
  update: { packageId: "choco", installs: [["choco", "upgrade", "chocolatey", "-y"]] },
});

const GH_MANUAL_MESSAGE =
  "Télécharger https://github.com/cli/cli/releases et remplacer gh.exe";

/** gh has no self-update: the installer that owns it upgrades it. */
const GH: ProviderContractCase = {
  ...selfCase("gh", {
    system: installedVia("winget", "gh", {
      commands: [
        versionProbe(
          "gh",
          "gh version 2.55.0 (2024-08-20)\nhttps://github.com/cli/cli/releases/tag/v2.55.0",
        ),
      ],
      http: [githubLatest("cli/cli", "v2.58.0")],
    }),
    row: [{ id: "gh", name: "GitHub CLI", current: "2.55.0", latest: "2.58.0" }],
    update: {
      packageId: "gh",
      installs: [
        [
          "winget",
          "upgrade",
          "--id",
          "GitHub.cli",
          "--silent",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ],
      ],
    },
  }),
  routes: delegationRoutes("gh", {
    ids: { winget: "GitHub.cli", scoop: "gh", choco: "gh" },
    manualMessage: GH_MANUAL_MESSAGE,
  }),
};

// --- Homebrew -------------------------------------------------------------------

/** `brew update` updates brew itself and its taps, never a formula. */
const BREW = selfCase("brew", {
  system: {
    platform: "darwin",
    bin: { brew: "/opt/homebrew/bin/brew" },
    commands: [versionProbe("brew", "Homebrew 4.3.24-56-g1a2b3c4")],
    http: [githubLatest("Homebrew/brew", "4.4.0")],
  },
  // A checkout past its tag: the `git describe` tail is not part of the version.
  row: [{ id: "brew", name: "Homebrew", current: "4.3.24", latest: "4.4.0" }],
  update: { packageId: "brew", installs: [["brew", "update"]] },
});

// --- JavaScript package managers -------------------------------------------------

const NPM = selfCase("npm", {
  system: {
    platform: "linux",
    bin: { npm: "/usr/local/bin/npm" },
    commands: [versionProbe("npm", "10.0.0")],
    http: [npmLatestRoute("npm", "10.1.0")],
  },
  row: [{ id: "npm", name: "npm", current: "10.0.0", latest: "10.1.0" }],
  update: { packageId: "npm", installs: [["npm", "install", "-g", "npm@latest"]] },
});

export const STANDALONE_PNPM = "C:\\Users\\u\\AppData\\Local\\pnpm\\pnpm.exe";

/** A standalone pnpm (not a Corepack shim) updates itself. */
export const PNPM_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { pnpm: STANDALONE_PNPM },
  commands: [versionProbe("pnpm", "9.0.0")],
  http: [npmLatestRoute("pnpm", "9.5.0")],
};

const PNPM = selfCase("pnpm", {
  system: PNPM_MACHINE,
  row: [{ id: "pnpm", name: "pnpm", current: "9.0.0", latest: "9.5.0" }],
  update: { packageId: "pnpm", installs: [["pnpm", "self-update"]] },
});

/** Yarn classic outside Corepack, on a machine without Corepack: npm reinstalls it. */
export const YARN_MACHINE: SystemSpec = {
  platform: "linux",
  bin: { yarn: "/usr/local/bin/yarn" },
  commands: [versionProbe("yarn", "1.22.19")],
  http: [npmLatestRoute("yarn", "1.22.22")],
};

const YARN = selfCase("yarn", {
  system: YARN_MACHINE,
  row: [{ id: "yarn", name: "Yarn", current: "1.22.19", latest: "1.22.22" }],
  update: { packageId: "yarn", installs: [["npm", "install", "-g", "yarn"]] },
});

// --- Python ---------------------------------------------------------------------

export const PIP_SELF_UPGRADE = [
  "-m",
  "pip",
  "install",
  "--user",
  "-U",
  "--disable-pip-version-check",
  "pip",
];

/**
 * pip on Windows, next to the python.exe that hosts it. The version has three
 * components: the parser needs them (provider-contracts.md §6).
 */
const PIP = selfCase("pip", {
  system: {
    platform: "win32",
    bin: { pip: "C:\\Python312\\Scripts\\pip.exe" },
    fs: { "C:\\Python312\\python.exe": { kind: "file", executable: true } },
    commands: [
      versionProbe("pip", "pip 23.3.1 from C:\\Python312\\Lib\\site-packages\\pip (python 3.12)"),
    ],
    http: [pypiRoute("pip", "24.2")],
  },
  row: [{ id: "pip", name: "pip", current: "23.3.1", latest: "24.2" }],
  // The interpreter behind the pip on PATH, never a bare `py`.
  update: { packageId: "pip", installs: [["C:\\Python312\\python.exe", ...PIP_SELF_UPGRADE]] },
});

/** `pipx upgrade pipx`, not `upgrade-all`: the apps are another provider's. */
const PIPX = selfCase("pipx", {
  system: {
    platform: "darwin",
    bin: { pipx: "/opt/homebrew/bin/pipx" },
    commands: [versionProbe("pipx", "1.4.0")],
    http: [pypiRoute("pipx", "1.7.1")],
  },
  row: [{ id: "pipx", name: "pipx", current: "1.4.0", latest: "1.7.1" }],
  update: { packageId: "pipx", installs: [["pipx", "upgrade", "pipx"]] },
});

export const selfCases: readonly ProviderContractCase[] = [
  WINGET,
  SCOOP,
  CHOCO,
  GH,
  BREW,
  NPM,
  PNPM,
  YARN,
  PIP,
  PIPX,
];
