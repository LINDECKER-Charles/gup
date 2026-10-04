import { AsdfProvider } from "../../../src/providers/toolchain/asdf.js";
import { GoenvProvider } from "../../../src/providers/toolchain/goenv.js";
import { MiseProvider } from "../../../src/providers/toolchain/mise.js";
import { ProtoProvider } from "../../../src/providers/toolchain/proto.js";
import { SdkmanProvider } from "../../../src/providers/toolchain/sdkman.js";
import { SwiftlyProvider } from "../../../src/providers/toolchain/swiftly.js";
import { installedVia } from "../../support/contract/installers.js";
import {
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Version managers that span several runtimes. The machines and outputs a
 * knowledge test starts from are exported; the rest of the case data stays
 * private.
 */

// --- asdf -----------------------------------------------------------------------

const ASDF_NOTE = "binaire — réinstaller via le PM source";

/** asdf printing `banner` for `asdf --version`, GitHub answering `tag`. */
function asdfMachine(banner: string, tag: string): SystemSpec {
  return installedVia("brew", "asdf", {
    commands: [{ argv: ["asdf", "--version"], stdout: banner }],
    http: [githubLatest("asdf-vm/asdf", tag)],
  });
}

/** The Go rewrite (0.16+) is a binary without a self-update: left to its installer. */
const ASDF_BINARY: ProviderContractCase = {
  scenario: "go rewrite",
  create: () => new AsdfProvider(),
  system: asdfMachine("0.16.7 (revision 1a2b3c4)", "v0.17.0"),
  outdated: [
    {
      id: "asdf",
      name: "asdf",
      current: "0.16.7",
      latest: "0.17.0",
      note: ASDF_NOTE,
      manual: true,
    },
  ],
  update: {
    packageId: "asdf",
    installs: [],
    outcome: {
      success: false,
      skipped: true,
      message: "asdf 0.16+ est distribué en binaire — réinstaller via apt/brew/scoop/manuel",
    },
  },
  updateAll: "skipped",
};

/**
 * A pre-0.16 clone still updates itself. Its row is labelled like the binary
 * one, `manual` included: the scan checks the legacy marker on the version
 * without its `v` (provider-contracts.md §6).
 */
const ASDF_LEGACY: ProviderContractCase = {
  scenario: "legacy clone",
  create: () => new AsdfProvider(),
  system: asdfMachine("v0.14.0-abc1234", "v0.16.7"),
  outdated: [
    {
      id: "asdf",
      name: "asdf",
      current: "0.14.0-abc1234",
      latest: "0.16.7",
      note: ASDF_NOTE,
      manual: true,
    },
  ],
  update: { packageId: "asdf", installs: [["asdf", "update"]] },
  updateAll: "collapsed",
};

/** The `-<sha>` suffix of a clone is not part of the version compared. */
const ASDF_UP_TO_DATE: ProviderContractCase = {
  scenario: "up to date",
  create: () => new AsdfProvider(),
  system: asdfMachine("v0.14.0-abc1234", "v0.14.0"),
  outdated: [],
  updateAll: "collapsed",
};

// --- goenv ----------------------------------------------------------------------

/** A git clone updated by the bundled goenv-update plugin. */
const GOENV: SelfUpdatingTool = {
  create: () => new GoenvProvider(),
  system: {
    platform: "darwin",
    bin: { goenv: "/Users/u/.goenv/bin/goenv" },
    commands: [{ argv: ["goenv", "--version"], stdout: "goenv 2.2.13" }],
  },
  release: githubLatest("go-nv/goenv", "2.3.0"),
  row: { id: "goenv", name: "goenv", current: "2.2.13", latest: "2.3.0", note: "goenv update" },
  upToDate: githubLatest("go-nv/goenv", "2.2.13"),
  installs: [["goenv", "update"]],
  // Without the plugin the command fails: the user is pointed at `git pull` instead.
  onFailure: {
    success: false,
    skipped: true,
    message: "`goenv update` indisponible — mettre à jour via `git -C $(goenv root) pull`",
  },
};

// --- mise -----------------------------------------------------------------------

const MISE_OUTDATED_ARGV = ["mise", "outdated", "--json"];

/** mise printing `report` for `mise outdated --json`. */
export function miseMachine(report: unknown): SystemSpec {
  return {
    platform: "win32",
    bin: { mise: "C:\\Users\\u\\AppData\\Local\\mise\\bin\\mise.exe" },
    commands: [{ argv: MISE_OUTDATED_ARGV, stdout: JSON.stringify(report) }],
  };
}

const MISE: ProviderContractCase = {
  create: () => new MiseProvider(),
  system: miseMachine([
    { name: "node", requested: "20", current: "20.11.0", latest: "20.18.0" },
    { name: "python", requested: "3.12", current: "3.12.4", latest: "3.12.7" },
  ]),
  outdated: [
    { id: "node", name: "node", current: "20.11.0", latest: "20.18.0" },
    { id: "python", name: "python", current: "3.12.4", latest: "3.12.7" },
  ],
  update: { packageId: "node", installs: [["mise", "upgrade", "node"]] },
  updateAll: "one-batch",
  // One run upgrades every outdated tool, selected or not.
  batchInstalls: [["mise", "upgrade"]],
};

// --- proto ----------------------------------------------------------------------

const PROTO_OUTDATED_ARGV = ["proto", "outdated", "--json"];

/** proto 0.40.4, its managed tools reported as `managed`. */
export function protoMachine(managed: unknown, release: HttpRoute): SystemSpec {
  return {
    platform: "linux",
    bin: { proto: "/home/u/.proto/bin/proto" },
    commands: [
      { argv: ["proto", "--version"], stdout: "proto 0.40.4" },
      { argv: PROTO_OUTDATED_ARGV, stdout: JSON.stringify(managed) },
    ],
    http: [release],
  };
}

/** Behind both ways: `newest` or `latest` names the target; incomplete or equal is skipped. */
const PROTO_MACHINE = protoMachine(
  {
    node: { current: "20.0.0", newest: "20.5.0" },
    deno: { current: "1.40.0", latest: "1.41.0" },
    bun: { current: "1.0.0" },
    go: { current: "1.22.0", newest: "1.22.0" },
  },
  githubLatest("moonrepo/proto", "v0.41.0"),
);

const PROTO_ROWS = [
  { id: "proto", name: "proto", current: "0.40.4", latest: "0.41.0" },
  { id: "node", name: "node", current: "20.0.0", latest: "20.5.0" },
  { id: "deno", name: "deno", current: "1.40.0", latest: "1.41.0" },
];

/** A managed tool is reinstalled at its newest version; proto itself upgrades itself. */
const PROTO_TOOL: ProviderContractCase = {
  scenario: "managed tool",
  create: () => new ProtoProvider(),
  system: PROTO_MACHINE,
  outdated: PROTO_ROWS,
  update: { packageId: "node", installs: [["proto", "install", "node"]] },
  updateAll: "per-package",
  batchInstalls: [
    ["proto", "upgrade"],
    ["proto", "install", "node"],
    ["proto", "install", "deno"],
  ],
};

const PROTO_SELF: ProviderContractCase = {
  ...PROTO_TOOL,
  scenario: "self-upgrade",
  update: { packageId: "proto", installs: [["proto", "upgrade"]] },
};

// --- SDKMAN! --------------------------------------------------------------------

const SDKMAN_INIT = "/home/u/.sdkman/bin/sdkman-init.sh";

/** `sdk` is a shell function: every call sources the init script in bash first. */
function sdkArgv(command: string, init = SDKMAN_INIT): string[] {
  return ["bash", "-lc", `source "${init}" >/dev/null 2>&1 && ${command}`];
}

const SDKMAN_BROKER_URL = "https://api.sdkman.io/2/broker/version/sdkman/stable";

/** SDKMAN! 5.18.2 on Linux, `sdk version` printing `stdout`. */
export function sdkmanMachine(stdout = "\nSDKMAN!\nscript: 5.18.2\nnative: 0.4.6\n"): SystemSpec {
  return {
    platform: "linux",
    bin: { bash: "/bin/bash" },
    fs: { [SDKMAN_INIT]: { kind: "file" } },
    commands: [{ argv: sdkArgv("sdk version"), stdout }],
  };
}

/** The broker answers plain text. */
const SDKMAN: SelfUpdatingTool = {
  create: () => new SdkmanProvider(),
  system: sdkmanMachine(),
  release: { url: SDKMAN_BROKER_URL, body: "5.19.0\n" },
  row: {
    id: "sdkman",
    name: "SDKMAN!",
    current: "5.18.2",
    latest: "5.19.0",
    note: "sdk selfupdate force",
  },
  upToDate: { url: SDKMAN_BROKER_URL, body: "5.18.2" },
  installs: [sdkArgv("sdk selfupdate force")],
};

// --- swiftly --------------------------------------------------------------------

export const SWIFTLY_VERSION_ARGV = ["swiftly", "--version"];
export const SWIFTLY_SELF_UPDATE = ["swiftly", "self-update", "--assume-yes"];
/** swiftlang tags without a `v`. */
const SWIFTLY_RELEASE = githubLatest("swiftlang/swiftly", "1.2.0");
const SWIFTLY_EXTERNAL_MESSAGE =
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
  ASDF_BINARY,
  ASDF_LEGACY,
  ASDF_UP_TO_DATE,
  ...selfUpdatingToolCases(GOENV),
  MISE,
  PROTO_TOOL,
  PROTO_SELF,
  ...selfUpdatingToolCases(SDKMAN),
  SWIFTLY_SELF_MANAGED,
  SWIFTLY_HOMEBREW,
  SWIFTLY_DEV_BUILD,
];
