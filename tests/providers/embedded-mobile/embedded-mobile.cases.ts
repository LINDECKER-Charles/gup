import { XcodesProvider } from "../../../src/providers/embedded-mobile/xcodes.js";
import { delegationRoutes, installedVia } from "../../support/contract/installers.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Embedded and mobile toolchains. The machines and outputs a knowledge test
 * starts from are exported; the rest of the case data stays private.
 */

// --- xcodes ---------------------------------------------------------------------

export const XCODES_VERSION_ARGV = ["xcodes", "version"];
/** XcodesOrg tags without a `v`. */
const XCODES_RELEASE = githubLatest("XcodesOrg/xcodes", "2.1.0");
const XCODES_MANUAL_MESSAGE =
  "Installation manuelle : télécharger la dernière version sur " +
  "https://github.com/XcodesOrg/xcodes/releases et remplacer le binaire xcodes.";

/** xcodes from Homebrew printing `version`, GitHub answering `release`. */
export function xcodesMachine(version: string, release: HttpRoute = XCODES_RELEASE): SystemSpec {
  return installedVia("brew", "xcodes", {
    commands: [{ argv: XCODES_VERSION_ARGV, stdout: version }],
    http: [release],
  });
}

/** A hand-installed xcodes: nothing owns /usr/local/bin/xcodes. */
const XCODES_BY_HAND: SystemSpec = {
  platform: "darwin",
  bin: { xcodes: "/usr/local/bin/xcodes" },
  commands: [{ argv: XCODES_VERSION_ARGV, stdout: "2.0.3" }],
  http: [XCODES_RELEASE],
};

/**
 * The xcodes binary, never the Xcodes it installs: the row is the tool, and
 * its upgrade goes to Homebrew, the only package manager that ships it.
 */
const XCODES: ProviderContractCase = {
  scenario: "homebrew",
  create: () => new XcodesProvider(),
  system: xcodesMachine("2.0.3"),
  outdated: [{ id: "xcodes", name: "xcodes", current: "2.0.3", latest: "2.1.0", note: "via brew" }],
  update: { packageId: "xcodes", installs: [["brew", "upgrade", "--formula", "xcodes"]] },
  // Homebrew only: every other installer gets the download instructions.
  routes: delegationRoutes("xcodes", {
    ids: { brew: "xcodes" },
    manualMessage: XCODES_MANUAL_MESSAGE,
  }),
  updateAll: "collapsed",
};

/** Never `manual: true` (the scan would drop it): a normal row whose update is skipped. */
const XCODES_BY_HAND_CASE: ProviderContractCase = {
  scenario: "manual install",
  create: () => new XcodesProvider(),
  system: XCODES_BY_HAND,
  outdated: [
    {
      id: "xcodes",
      name: "xcodes",
      current: "2.0.3",
      latest: "2.1.0",
      note: "installation manuelle — mise à jour à faire à la main",
    },
  ],
  update: {
    packageId: "xcodes",
    installs: [],
    outcome: { success: false, skipped: true, message: XCODES_MANUAL_MESSAGE },
  },
  updateAll: "skipped",
};

/** A build from `main` reports the next version: never "update" it down to the tag. */
const XCODES_AHEAD: ProviderContractCase = {
  scenario: "build ahead of the release",
  create: () => new XcodesProvider(),
  system: xcodesMachine("2.2.0"),
  outdated: [],
  updateAll: "collapsed",
};

export const embeddedMobileCases: readonly ProviderContractCase[] = [
  XCODES,
  XCODES_BY_HAND_CASE,
  XCODES_AHEAD,
];
