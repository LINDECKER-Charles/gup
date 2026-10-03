import { NvmProvider } from "../../../src/providers/node/nvm.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { FsNode, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Node.js package managers and version managers. The machines and outputs a
 * knowledge test starts from are exported; the rest of the case data stays
 * private.
 */

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

export const nodeCases: readonly ProviderContractCase[] = [NVM_CLONE, NVM_COPY, NVM_AHEAD];
