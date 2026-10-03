import { BunGlobalProvider } from "../../../src/providers/node/bun-global.js";
import { CorepackProvider } from "../../../src/providers/node/corepack.js";
import { NpmGlobalProvider } from "../../../src/providers/node/npm-global.js";
import { PnpmGlobalProvider } from "../../../src/providers/node/pnpm-global.js";
import { YarnGlobalProvider } from "../../../src/providers/node/yarn-global.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { npmLatestRoute } from "../../support/system/releases.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * The global packages of the JavaScript package managers (the runtimes and
 * version managers are in runtimes.cases.ts). The machines and outputs a
 * knowledge test starts from are exported; the rest of the case data stays
 * private.
 */

const NODE_DIR = "C:\\Program Files\\nodejs";

// --- npm ------------------------------------------------------------------------

export const NPM_OUTDATED_ARGV = ["npm", "outdated", "-g", "--json", "--long"];

/** npm printing `report` for `npm outdated -g --json`. */
export function npmMachine(report: string): SystemSpec {
  return {
    platform: "win32",
    bin: { npm: `${NODE_DIR}\\npm.cmd` },
    // npm exits 1 when something is outdated; the report is on stdout all the same.
    commands: [{ argv: NPM_OUTDATED_ARGV, stdout: report, exitCode: 1 }],
  };
}

/** `@latest`, so a new major is installed too. */
const NPM: ProviderContractCase = {
  create: () => new NpmGlobalProvider(),
  system: npmMachine(
    JSON.stringify({
      typescript: { current: "5.4.5", wanted: "5.4.5", latest: "5.6.2", location: "" },
      "@angular/cli": { current: "17.3.0", wanted: "17.3.0", latest: "18.2.4", location: "" },
    }),
  ),
  outdated: [
    { id: "typescript", name: "typescript", current: "5.4.5", latest: "5.6.2" },
    { id: "@angular/cli", name: "@angular/cli", current: "17.3.0", latest: "18.2.4" },
  ],
  update: { packageId: "typescript", installs: [["npm", "install", "-g", "typescript@latest"]] },
  updateAll: "one-batch",
  batchInstalls: [["npm", "install", "-g", "typescript@latest", "@angular/cli@latest"]],
};

// --- pnpm -----------------------------------------------------------------------

export const PNPM_OUTDATED_ARGV = ["pnpm", "outdated", "--global", "--format", "json"];

/** pnpm printing `report` for `pnpm outdated --global --format json`. */
export function pnpmMachine(report: string): SystemSpec {
  return {
    platform: "darwin",
    bin: { pnpm: "/Users/u/Library/pnpm/pnpm" },
    commands: [{ argv: PNPM_OUTDATED_ARGV, stdout: report, exitCode: 1 }],
  };
}

/** A deprecated package says so; a current one is not listed. */
const PNPM: ProviderContractCase = {
  create: () => new PnpmGlobalProvider(),
  system: pnpmMachine(
    JSON.stringify({
      vercel: {
        current: "37.0.0",
        wanted: "37.0.0",
        latest: "37.6.0",
        dependencyType: "dependencies",
      },
      tslint: {
        current: "5.20.0",
        wanted: "5.20.0",
        latest: "6.1.3",
        isDeprecated: true,
        dependencyType: "dependencies",
      },
      zx: { current: "8.1.8", wanted: "8.1.8", latest: "8.1.8", dependencyType: "dependencies" },
    }),
  ),
  outdated: [
    { id: "vercel", name: "vercel", current: "37.0.0", latest: "37.6.0" },
    { id: "tslint", name: "tslint", current: "5.20.0", latest: "6.1.3", note: "deprecated" },
  ],
  update: { packageId: "vercel", installs: [["pnpm", "add", "-g", "vercel@latest"]] },
  updateAll: "one-batch",
  // `add`, not `update`: `pnpm update` respects semver and would skip a major.
  batchInstalls: [["pnpm", "add", "-g", "vercel@latest", "tslint@latest"]],
};

// --- Yarn classic ---------------------------------------------------------------

export const YARN_VERSION_ARGV = ["yarn", "--version"];
export const YARN_LIST_ARGV = ["yarn", "global", "list", "--depth=0"];

/** Yarn printing `version` and `listing`, the registry answering `http`. */
export function yarnMachine(
  version: Omit<CommandScript, "argv">,
  listing: string,
  http: readonly HttpRoute[] = [],
): SystemSpec {
  return {
    platform: "linux",
    bin: { yarn: "/usr/local/bin/yarn" },
    commands: [
      { argv: YARN_VERSION_ARGV, ...version },
      { argv: YARN_LIST_ARGV, stdout: listing },
    ],
    http,
  };
}

const YARN_LISTING = [
  'info "typescript@5.0.0" has binaries:',
  "   - tsc",
  "   - tsserver",
  'info "prettier@3.0.0" has binaries:',
  "   - prettier",
  'info "nodemon@3.1.0" has binaries:',
  "   - nodemon",
  "Done in 0.12s.",
].join("\n");

/** Yarn 1 only; one registry lookup per package. */
const YARN: ProviderContractCase = {
  create: () => new YarnGlobalProvider(),
  system: yarnMachine({ stdout: "1.22.22" }, YARN_LISTING, [
    npmLatestRoute("typescript", "5.6.2"),
    npmLatestRoute("prettier", "3.0.0"),
    npmLatestRoute("nodemon", "3.1.7"),
  ]),
  outdated: [
    { id: "typescript", name: "typescript", current: "5.0.0", latest: "5.6.2" },
    { id: "nodemon", name: "nodemon", current: "3.1.0", latest: "3.1.7" },
  ],
  update: { packageId: "typescript", installs: [["yarn", "global", "add", "typescript@latest"]] },
  updateAll: "one-batch",
  batchInstalls: [["yarn", "global", "add", "typescript@latest", "nodemon@latest"]],
};

// --- Bun ------------------------------------------------------------------------

export const BUN_LIST_ARGV = ["bun", "pm", "ls", "-g"];

/** Bun printing `listing` for `bun pm ls -g`, the registry answering `http`. */
export function bunMachine(listing: string, http: readonly HttpRoute[] = []): SystemSpec {
  return {
    platform: "win32",
    bin: { bun: "C:\\Users\\u\\.bun\\bin\\bun.exe" },
    commands: [{ argv: BUN_LIST_ARGV, stdout: listing }],
    http,
  };
}

/** The box-drawing tree `bun pm ls -g` prints; a scoped name keeps its `@`. */
const BUN: ProviderContractCase = {
  create: () => new BunGlobalProvider(),
  system: bunMachine(
    [
      "C:\\Users\\u\\.bun\\install\\global node_modules (3)",
      "├── typescript@5.0.0",
      "├── prettier@3.0.0",
      "└── @scope/pkg@1.0.0",
    ].join("\n"),
    [
      npmLatestRoute("typescript", "5.1.0"),
      npmLatestRoute("prettier", "3.0.0"),
      npmLatestRoute("@scope/pkg", "2.0.0"),
    ],
  ),
  outdated: [
    { id: "typescript", name: "typescript", current: "5.0.0", latest: "5.1.0" },
    { id: "@scope/pkg", name: "@scope/pkg", current: "1.0.0", latest: "2.0.0" },
  ],
  update: { packageId: "typescript", installs: [["bun", "add", "-g", "typescript@latest"]] },
  updateAll: "one-batch",
  // `bun update -g` upgrades every global package, selected or not.
  batchInstalls: [["bun", "update", "-g"]],
};

// --- Corepack -------------------------------------------------------------------

/** Node's own directory: corepack and the shims it installed for pnpm and yarn. */
export const COREPACK_BIN = `${NODE_DIR}\\corepack.cmd`;

const COREPACK_SHIMS: Readonly<Record<string, string>> = {
  corepack: COREPACK_BIN,
  pnpm: `${NODE_DIR}\\pnpm.cmd`,
  yarn: `${NODE_DIR}\\yarn.cmd`,
};

/** Corepack serving pnpm 9.0.0 (behind) and yarn 4.5.0 (current). */
export const COREPACK_MACHINE: SystemSpec = {
  platform: "win32",
  bin: COREPACK_SHIMS,
  commands: [
    { argv: ["pnpm", "--version"], stdout: "9.0.0\n" },
    { argv: ["yarn", "--version"], stdout: "4.5.0" },
  ],
  http: [npmLatestRoute("pnpm", "9.5.0"), npmLatestRoute("yarn", "4.5.0")],
};

/** The global default is activated, not a project pin (`corepack use`). */
const COREPACK: ProviderContractCase = {
  create: () => new CorepackProvider(),
  system: COREPACK_MACHINE,
  outdated: [{ id: "pnpm", name: "pnpm", current: "9.0.0", latest: "9.5.0" }],
  update: {
    packageId: "pnpm",
    installs: [["corepack", "prepare", "pnpm@latest", "--activate"]],
  },
  updateAll: "per-package",
};

export const nodeCases: readonly ProviderContractCase[] = [NPM, PNPM, YARN, BUN, COREPACK];
