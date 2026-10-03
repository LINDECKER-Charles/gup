import { fileURLToPath } from "node:url";
import type { GoldenRef } from "../fixtures/refs.js";
import type { ProviderContractCase } from "../contract/types.js";
import { delegationRoutes } from "../contract/installers.js";
import type { SystemSpec } from "../system/types.js";
import {
  BatchManagerProvider,
  ListManagerProvider,
  PerRowLookupProvider,
  ReleaseToolProvider,
  StateFileProvider,
} from "./fake-providers.js";

/** Contract cases of the self-test providers: the harness's own end-to-end proof. */

const RTOOL_RELEASE = "https://api.github.com/repos/acme/rtool/releases/latest";

const LISTING = JSON.stringify([
  { name: "left-pad", current: "1.0.0", latest: "1.3.0" },
  { name: "is-odd", current: "2.0.0", latest: "3.0.1" },
  { name: "up-to-date", current: "5.0.0", latest: "5.0.0" },
]);

const LIST_MACHINE: SystemSpec = {
  platform: "linux",
  bin: { lm: "/usr/local/bin/lm" },
  commands: [{ argv: ["lm", "outdated", "--json"], stdout: LISTING }],
};

const LISTED_ROWS = [
  { id: "left-pad", current: "1.0.0", latest: "1.3.0" },
  { id: "is-odd", current: "2.0.0", latest: "3.0.1" },
];

/** Committed next to this file rather than under tests/providers/: it belongs to no domain. */
export const LISTING_GOLDEN: GoldenRef = {
  kind: "golden",
  file: fileURLToPath(new URL("./__golden__/lm.listing.json", import.meta.url)),
};

export const SELF_TEST_CASES: readonly ProviderContractCase[] = [
  {
    scenario: "scoop on windows",
    create: () => new ReleaseToolProvider(),
    system: {
      platform: "win32",
      bin: { rtool: "C:\\Users\\u\\scoop\\shims\\rtool.exe" },
      commands: [{ argv: ["rtool", "--version"], stdout: "rtool v1.2.0\n" }],
      http: [{ url: RTOOL_RELEASE, json: { tag_name: "v1.4.0" } }],
    },
    outdated: [{ id: "rtool", current: "1.2.0", latest: "1.4.0", note: "via scoop" }],
    update: { packageId: "rtool", installs: [["scoop", "update", "rtool"]] },
    routes: delegationRoutes("rtool", {
      ids: { scoop: "rtool", brew: "rtool" },
      manualMessage: "Télécharger rtool",
    }),
    updateAll: "collapsed",
  },
  {
    scenario: "homebrew on macos",
    create: () => new ReleaseToolProvider(),
    system: {
      platform: "darwin",
      bin: { rtool: "/opt/homebrew/bin/rtool" },
      fs: {
        "/opt/homebrew/bin/rtool": { kind: "symlink", target: "../Cellar/rtool/1.2.0/bin/rtool" },
        "/opt/homebrew/Cellar/rtool/1.2.0/bin/rtool": { kind: "file", executable: true },
      },
      commands: [{ argv: ["rtool", "--version"], stdout: "rtool 1.2.0" }],
      http: [{ url: RTOOL_RELEASE, json: { tag_name: "v1.4.0" } }],
    },
    outdated: [{ id: "rtool", current: "1.2.0", latest: "1.4.0", note: "via brew" }],
    update: { packageId: "rtool", installs: [["brew", "upgrade", "--formula", "rtool"]] },
    updateAll: "collapsed",
  },
  {
    create: () => new ListManagerProvider(),
    system: LIST_MACHINE,
    outdated: LISTED_ROWS,
    update: { packageId: "left-pad", installs: [["lm", "upgrade", "left-pad"]] },
    updateAll: "per-package",
  },
  {
    scenario: "golden",
    create: () => new ListManagerProvider(),
    system: LIST_MACHINE,
    outdated: LISTING_GOLDEN,
    updateAll: "per-package",
  },
  {
    create: () => new BatchManagerProvider(),
    system: LIST_MACHINE,
    outdated: LISTED_ROWS,
    update: { packageId: "is-odd", installs: [["lm", "upgrade", "is-odd"]] },
    updateAll: "one-batch",
    batchInstalls: [["lm", "upgrade", "left-pad", "is-odd"]],
  },
  {
    create: () => new StateFileProvider(),
    system: {
      platform: "linux",
      fs: { "/home/u/.statefile/state.json": { kind: "file", content: LISTING } },
    },
    outdated: LISTED_ROWS,
    update: {
      packageId: "left-pad",
      installs: [],
      outcome: { success: false, skipped: true, message: "Mettre à jour à la main" },
    },
    updateAll: "skipped",
  },
  {
    create: () => new PerRowLookupProvider(),
    system: {
      ...LIST_MACHINE,
      http: [
        { url: "https://registry.test/left-pad", json: {} },
        { url: "https://registry.test/is-odd", json: {} },
      ],
    },
    outdated: LISTED_ROWS,
    updateAll: "per-package",
    waivers: [{ invariant: "slow-flag", reason: "self-test: proves a used waiver passes" }],
  },
];
