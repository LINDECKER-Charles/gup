import { DenoProvider } from "../../../src/providers/node/deno.js";
import { FnmProvider } from "../../../src/providers/node/fnm.js";
import { NvmProvider } from "../../../src/providers/node/nvm.js";
import { NvmWindowsProvider } from "../../../src/providers/node/nvm-windows.js";
import { VoltaProvider } from "../../../src/providers/node/volta.js";
import {
  type ReleasedTool,
  releasedToolCases,
} from "../../support/contract/released-tool.js";
import {
  nothingListedOn,
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { FsNode, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * JavaScript runtimes and the Node version managers: the tools themselves,
 * never the Node versions they manage. The package managers are in
 * node.cases.ts. The machines and outputs a knowledge test starts from are
 * exported; the rest of the case data stays private.
 */

// --- Deno -----------------------------------------------------------------------

const DENO_RELEASE_URL = "https://api.github.com/repos/denoland/deno/releases/latest";

/** Deno upgrades itself; it reads its GitHub release on its own. */
const DENO: SelfUpdatingTool = {
  create: () => new DenoProvider(),
  system: {
    platform: "win32",
    bin: { deno: "C:\\Users\\u\\.deno\\bin\\deno.exe" },
    commands: [
      {
        argv: ["deno", "--version"],
        stdout: [
          "deno 1.46.3 (stable, release, x86_64-pc-windows-msvc)",
          "v8 12.9.202.5-rusty",
          "typescript 5.5.2",
        ].join("\n"),
      },
    ],
  },
  release: githubLatest("denoland/deno", "v1.47.0"),
  row: { id: "deno", name: "Deno", current: "1.46.3", latest: "1.47.0" },
  upToDate: githubLatest("denoland/deno", "v1.46.3"),
  installs: [["deno", "upgrade"]],
};

// --- fnm, Volta, nvm-windows: binaries their installer upgrades ---------------------

const FNM: ReleasedTool = {
  create: () => new FnmProvider(),
  id: "fnm",
  name: "fnm",
  binary: "fnm",
  probe: { argv: ["fnm", "--version"], stdout: "fnm 1.37.0" },
  current: "1.37.0",
  release: githubLatest("Schniz/fnm", "v1.38.0"),
  latest: "1.38.0",
  upToDate: githubLatest("Schniz/fnm", "v1.37.0"),
  delegation: {
    ids: { scoop: "fnm", choco: "fnm", winget: "Schniz.fnm", brew: "fnm" },
    manualMessage: "Télécharger https://github.com/Schniz/fnm/releases et remplacer fnm.exe",
  },
};

const VOLTA: ReleasedTool = {
  create: () => new VoltaProvider(),
  id: "volta",
  name: "Volta",
  binary: "volta",
  probe: { argv: ["volta", "--version"], stdout: "1.1.1" },
  current: "1.1.1",
  release: githubLatest("volta-cli/volta", "v2.0.1"),
  latest: "2.0.1",
  upToDate: githubLatest("volta-cli/volta", "v1.1.1"),
  delegation: {
    ids: { scoop: "volta", choco: "volta", winget: "Volta.Volta", brew: "volta" },
    manualMessage:
      "Télécharger https://github.com/volta-cli/volta/releases et remplacer volta.exe",
  },
};

export const NVM_WINDOWS_PROBE = ["nvm", "version"];

/** Windows-only: no Homebrew id, the macOS route gets the download instructions. */
const NVM_WINDOWS: ReleasedTool = {
  create: () => new NvmWindowsProvider(),
  id: "nvm-windows",
  name: "nvm-windows",
  binary: "nvm",
  probe: { argv: NVM_WINDOWS_PROBE, stdout: "1.1.12" },
  current: "1.1.12",
  release: githubLatest("coreybutler/nvm-windows", "1.2.2"),
  latest: "1.2.2",
  upToDate: githubLatest("coreybutler/nvm-windows", "1.1.12"),
  delegation: {
    ids: { scoop: "nvm", choco: "nvm", winget: "CoreyButler.NVMforWindows" },
    manualMessage:
      "Télécharger https://github.com/coreybutler/nvm-windows/releases et exécuter nvm-setup.exe",
  },
};

// --- nvm ------------------------------------------------------------------------

export const NVM_HOME = "/home/u/.nvm";
/** The directory reaches the script through the environment, never spliced in. */
export const NVM_VERSION_ARGV = [
  "bash",
  "-c",
  '. "$GUP_NVM_DIR/nvm.sh" --no-use >/dev/null 2>&1 && nvm --version',
];
/** nvm-sh tags with a `v`, which the checkout needs as published. */
export const NVM_RELEASE = githubLatest("nvm-sh/nvm", "v0.40.6");
export const NVM_MANUAL_MESSAGE =
  "Installation nvm hors dépôt git — mettre à jour en suivant https://github.com/nvm-sh/nvm#installing-and-updating";

/** The README's manual upgrade, minus the `cd`: fetch the tags, check out the release. */
export function nvmUpgradeArgvs(dir: string, tag: string): string[][] {
  return [
    ["git", "-C", dir, "fetch", "--tags", "origin"],
    ["git", "-C", dir, "checkout", tag],
  ];
}

export interface NvmInstall {
  /** Where nvm.sh lives. Default ~/.nvm. */
  readonly dir?: string;
  /** A git clone (the install script's layout) or a copied tree. Default clone. */
  readonly isClone?: boolean;
  /** What `nvm --version` prints. */
  readonly version: string;
  readonly release?: HttpRoute;
  readonly env?: Readonly<Record<string, string>>;
}

/** An nvm install on Linux, with bash and git on PATH. */
export function nvmMachine(install: NvmInstall): SystemSpec {
  const dir = install.dir ?? NVM_HOME;
  const fs: Record<string, FsNode> = { [`${dir}/nvm.sh`]: { kind: "file" } };
  if (install.isClone ?? true) fs[`${dir}/.git`] = { kind: "dir" };
  return {
    platform: "linux",
    bin: { bash: "/bin/bash", git: "/usr/bin/git" },
    commands: [{ argv: NVM_VERSION_ARGV, stdout: install.version }],
    http: [install.release ?? NVM_RELEASE],
    fs,
    ...(install.env && { env: install.env }),
  };
}

const NVM_ROW = { id: "nvm", name: "nvm", current: "0.40.5", latest: "0.40.6" };

/** Never `curl | bash`: the README's own manual recipe, on the tag GitHub published. */
const NVM_CLONE: ProviderContractCase = {
  scenario: "git clone",
  create: () => new NvmProvider(),
  system: nvmMachine({ version: "0.40.5" }),
  outdated: [{ ...NVM_ROW, note: "dépôt git — checkout du tag" }],
  update: {
    packageId: "nvm",
    installs: nvmUpgradeArgvs(NVM_HOME, "v0.40.6"),
    outcome: {
      message:
        'nvm mis à jour vers v0.40.6 — dépôt laissé en HEAD détaché sur le tag (recette officielle nvm) ; recharger le shell (source "$NVM_DIR/nvm.sh") pour activer la nouvelle version.',
    },
    onFailure: {
      success: false,
      message: `Échec de git checkout v0.40.6 — modifications locales dans ${NVM_HOME} ?`,
    },
  },
  updateAll: "collapsed",
};

/** A copied tree cannot move to a tag: visible, not `manual: true`, and skipped. */
const NVM_COPY: ProviderContractCase = {
  scenario: "copied tree",
  create: () => new NvmProvider(),
  system: nvmMachine({ version: "0.40.5", isClone: false }),
  outdated: [{ ...NVM_ROW, note: "installation non-git — mise à jour manuelle" }],
  update: {
    packageId: "nvm",
    installs: [],
    outcome: { success: false, skipped: true, message: NVM_MANUAL_MESSAGE },
  },
  updateAll: "skipped",
};

/** A checkout past the releases feed: a checkout would be a downgrade, so none runs. */
const NVM_AHEAD: ProviderContractCase = {
  scenario: "checkout ahead of the release",
  create: () => new NvmProvider(),
  system: nvmMachine({ version: "0.41.0" }),
  outdated: [],
  update: {
    packageId: "nvm",
    installs: [],
    outcome: {
      success: false,
      skipped: true,
      message: "nvm est déjà sur la dernière version publiée (0.40.6) — aucun checkout.",
    },
  },
  updateAll: "collapsed",
};

export const runtimeCases: readonly ProviderContractCase[] = [
  ...selfUpdatingToolCases(DENO),
  // Deno reads the GitHub API itself: a release without a tag lists nothing.
  nothingListedOn(DENO, "release without a tag", {
    url: DENO_RELEASE_URL,
    json: { name: "v1.47.0" },
  }),
  ...[FNM, VOLTA, NVM_WINDOWS].flatMap(releasedToolCases),
  NVM_CLONE,
  NVM_COPY,
  NVM_AHEAD,
];
