import { SwiftlyProvider } from "../../../src/providers/toolchain/swiftly.js";
import { installedVia } from "../../support/contract/installers.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * Version managers that span several runtimes. The machines and outputs a
 * knowledge test starts from are exported; the rest of the case data stays
 * private.
 */

// --- swiftly --------------------------------------------------------------------

export const SWIFTLY_VERSION_ARGV = ["swiftly", "--version"];
export const SWIFTLY_SELF_UPDATE = ["swiftly", "self-update", "--assume-yes"];
/** swiftlang tags without a `v`. */
const SWIFTLY_RELEASE = githubLatest("swiftlang/swiftly", "1.2.0");
export const SWIFTLY_EXTERNAL_MESSAGE =
  "swiftly a été installé par un autre canal : le mettre à jour depuis cette source " +
  "(`swiftly self-update` refuse de s'exécuter sur une installation externe).";

/** swiftly in its own bin directory (its installer's), printing `version`. */
export function swiftlyMachine(version: string): SystemSpec {
  return {
    platform: "darwin",
    bin: { swiftly: "/Users/u/.swiftly/bin/swiftly" },
    commands: [{ argv: SWIFTLY_VERSION_ARGV, stdout: version }],
    http: [SWIFTLY_RELEASE],
  };
}

/** swiftly from Homebrew, printing 1.1.3. */
export const SWIFTLY_BREW_MACHINE: SystemSpec = installedVia("brew", "swiftly", {
  commands: [{ argv: SWIFTLY_VERSION_ARGV, stdout: "1.1.3" }],
  http: [SWIFTLY_RELEASE],
});

const SWIFTLY_ROW = { id: "swiftly", name: "swiftly", current: "1.1.3", latest: "1.2.0" };

/** Only an install swiftly made itself can self-update. */
const SWIFTLY_SELF_MANAGED: ProviderContractCase = {
  scenario: "self-managed",
  create: () => new SwiftlyProvider(),
  system: swiftlyMachine("1.1.3"),
  outdated: [{ ...SWIFTLY_ROW, note: "swiftly self-update" }],
  update: {
    packageId: "swiftly",
    installs: [SWIFTLY_SELF_UPDATE],
    onFailure: { success: false, message: SWIFTLY_EXTERNAL_MESSAGE },
  },
  updateAll: "collapsed",
};

/**
 * `swiftly self-update` refuses an external install: Homebrew upgrades its
 * own, and no distro packages swiftly, so an apt-owned binary is left to the
 * user.
 */
const SWIFTLY_HOMEBREW: ProviderContractCase = {
  scenario: "homebrew",
  create: () => new SwiftlyProvider(),
  system: SWIFTLY_BREW_MACHINE,
  outdated: [{ ...SWIFTLY_ROW, note: "via brew" }],
  update: { packageId: "swiftly", installs: [["brew", "upgrade", "--formula", "swiftly"]] },
  routes: [
    {
      via: "apt",
      system: installedVia("apt", "swiftly"),
      installs: [],
      outcome: { success: false, skipped: true, message: SWIFTLY_EXTERNAL_MESSAGE },
    },
  ],
  updateAll: "collapsed",
};

/** A development build reports the next version: never "update" it down to the tag. */
const SWIFTLY_DEV_BUILD: ProviderContractCase = {
  scenario: "development build",
  create: () => new SwiftlyProvider(),
  system: swiftlyMachine("1.3.0-dev"),
  outdated: [],
  updateAll: "collapsed",
};

export const toolchainCases: readonly ProviderContractCase[] = [
  SWIFTLY_SELF_MANAGED,
  SWIFTLY_HOMEBREW,
  SWIFTLY_DEV_BUILD,
];
