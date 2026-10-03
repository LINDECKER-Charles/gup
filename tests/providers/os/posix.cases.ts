import { BrewCaskProvider } from "../../../src/providers/os/brew-cask.js";
import { BrewProvider } from "../../../src/providers/os/brew.js";
import { MacPortsProvider } from "../../../src/providers/os/macports.js";
import { MasProvider } from "../../../src/providers/os/mas.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * macOS and Linux package managers. Sample outputs are exported: the
 * knowledge tests of each provider start from the same nominal machine.
 */

// --- Homebrew ---------------------------------------------------------------

export const BREW_FORMULAE_ARGV = ["brew", "outdated", "--formula", "--json=v2"];
export const BREW_CASKS_ARGV = ["brew", "outdated", "--cask", "--json=v2"];

/** `brew outdated --formula --json=v2`: a pinned formula, a formula with two kegs. */
export const BREW_FORMULAE_JSON = JSON.stringify({
  formulae: [
    {
      name: "libnghttp2",
      installed_versions: ["1.69.0"],
      current_version: "1.70.0",
      pinned: false,
      pinned_version: null,
    },
    {
      name: "php@8.3",
      installed_versions: ["8.3.31", "8.3.32"],
      current_version: "8.3.33",
      pinned: false,
    },
    { name: "node", installed_versions: ["22.1.0"], current_version: "24.0.0", pinned: true },
  ],
  casks: [],
});

/** `brew outdated --cask --json=v2`: the array form and the singular installed_version. */
export const BREW_CASKS_JSON = JSON.stringify({
  formulae: [],
  casks: [
    { name: "iterm2", installed_versions: ["3.4.23"], current_version: "3.5.0" },
    { name: "visual-studio-code", installed_version: "1.89.0", current_version: "1.90.0" },
  ],
});

export const BREW_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { brew: "/opt/homebrew/bin/brew" },
  commands: [
    { argv: BREW_FORMULAE_ARGV, stdout: BREW_FORMULAE_JSON },
    { argv: BREW_CASKS_ARGV, stdout: BREW_CASKS_JSON },
  ],
};

const BREW: ProviderContractCase = {
  scenario: "macos",
  create: () => new BrewProvider(),
  system: BREW_MACHINE,
  outdated: [
    { id: "libnghttp2", name: "libnghttp2", current: "1.69.0", latest: "1.70.0" },
    { id: "php@8.3", name: "php@8.3", current: "8.3.32", latest: "8.3.33" },
    { id: "node", name: "node", current: "22.1.0", latest: "24.0.0", note: "pinned" },
  ],
  update: { packageId: "libnghttp2", installs: [["brew", "upgrade", "--formula", "libnghttp2"]] },
  updateAll: "one-batch",
  // One resolution pass for the whole set; brew skips pinned formulae itself.
  batchInstalls: [["brew", "upgrade", "--formula"]],
};

/** Linuxbrew: the same provider, the same envelope, under its own prefix. */
const LINUXBREW: ProviderContractCase = {
  scenario: "linuxbrew",
  create: () => new BrewProvider(),
  system: {
    platform: "linux",
    bin: { brew: "/home/linuxbrew/.linuxbrew/bin/brew" },
    commands: [
      {
        argv: BREW_FORMULAE_ARGV,
        stdout: JSON.stringify({
          formulae: [{ name: "gh", installed_versions: ["2.40.0"], current_version: "2.42.1" }],
          casks: [],
        }),
      },
    ],
  },
  outdated: [{ id: "gh", name: "gh", current: "2.40.0", latest: "2.42.1" }],
  update: { packageId: "gh", installs: [["brew", "upgrade", "--formula", "gh"]] },
  updateAll: "one-batch",
  batchInstalls: [["brew", "upgrade", "--formula"]],
};

const BREW_CASK: ProviderContractCase = {
  create: () => new BrewCaskProvider(),
  system: BREW_MACHINE,
  outdated: [
    { id: "iterm2", name: "iterm2", current: "3.4.23", latest: "3.5.0" },
    {
      id: "visual-studio-code",
      name: "visual-studio-code",
      current: "1.89.0",
      latest: "1.90.0",
    },
  ],
  update: { packageId: "iterm2", installs: [["brew", "upgrade", "--cask", "iterm2"]] },
  updateAll: "one-batch",
  batchInstalls: [["brew", "upgrade", "--cask"]],
};

// --- Mac App Store ------------------------------------------------------------

export const MAS_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { mas: "/opt/homebrew/bin/mas" },
  commands: [
    {
      argv: ["mas", "outdated"],
      stdout: "497799835 Xcode (14.2 -> 14.3)\n409183694 Keynote for Mac (12.2.1 -> 13.0)",
    },
  ],
};

const MAS: ProviderContractCase = {
  create: () => new MasProvider(),
  system: MAS_MACHINE,
  outdated: [
    { id: "497799835", name: "Xcode", current: "14.2", latest: "14.3" },
    { id: "409183694", name: "Keynote for Mac", current: "12.2.1", latest: "13.0" },
  ],
  // The numeric App Store id is the upgrade target.
  update: { packageId: "497799835", installs: [["mas", "upgrade", "497799835"]] },
  updateAll: "one-batch",
  batchInstalls: [["mas", "upgrade"]],
};

// --- MacPorts -----------------------------------------------------------------

export const PORT_OUTDATED = [
  "The following installed ports are outdated:",
  "gettext                        0.21_0 < 0.22_1",
  "libiconv                       1.16_1 < 1.17_0",
].join("\n");

/** A MacPorts tree; `elevated` says whether gup already runs as root. */
export function macportsMachine(elevated: boolean): SystemSpec {
  return {
    platform: "darwin",
    bin: { port: "/opt/local/bin/port" },
    commands: [{ argv: ["port", "outdated"], stdout: PORT_OUTDATED }],
    elevated,
  };
}

const PORT_ROWS = [
  { id: "gettext", name: "gettext", current: "0.21_0", latest: "0.22_1" },
  { id: "libiconv", name: "libiconv", current: "1.16_1", latest: "1.17_0" },
];

/** Every write needs root: rows join the CLI's single sudo batch. */
const MACPORTS_AS_USER: ProviderContractCase = {
  scenario: "regular user",
  create: () => new MacPortsProvider(),
  system: macportsMachine(false),
  outdated: PORT_ROWS.map((row) => ({ ...row, requiresAdmin: true })),
  update: { packageId: "gettext", installs: [["sudo", "port", "-N", "upgrade", "gettext"]] },
  updateAll: "one-batch",
  batchInstalls: [["sudo", "port", "-N", "upgrade", "outdated"]],
};

/** Inside the root batch the rows update in place. */
const MACPORTS_AS_ROOT: ProviderContractCase = {
  scenario: "root",
  create: () => new MacPortsProvider(),
  system: macportsMachine(true),
  outdated: PORT_ROWS,
  updateAll: "one-batch",
};

export const posixCases: readonly ProviderContractCase[] = [
  BREW,
  LINUXBREW,
  BREW_CASK,
  MAS,
  MACPORTS_AS_USER,
  MACPORTS_AS_ROOT,
];
