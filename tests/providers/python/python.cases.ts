import { PyenvProvider } from "../../../src/providers/python/pyenv.js";
import { delegationRoutes, installedVia } from "../../support/contract/installers.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandScript, SystemSpec } from "../../support/system/types.js";

/**
 * Python's package and version managers. The machines and outputs a knowledge
 * test starts from are exported; the rest of the case data stays private.
 */

// --- pyenv ----------------------------------------------------------------------

export const PYENV_VERSION_ARGV = ["pyenv", "--version"];
export const PYENV_ROOT_ARGV = ["pyenv", "root"];
export const PYENV_RELEASE = githubLatest("pyenv/pyenv", "v2.9.0");
export const PYENV_MANUAL_MESSAGE =
  "Aucune mise à jour automatique pour cette installation de pyenv : mettre à jour le clone git (cd $(pyenv root) && git pull --ff-only) ou réinstaller via https://pyenv.run";

/** pyenv printing `pyenv <version>`, and `root` for `pyenv root`. */
export function pyenvAnswers(version: string, root: Omit<CommandScript, "argv">): CommandScript[] {
  return [
    { argv: PYENV_VERSION_ARGV, stdout: `pyenv ${version}` },
    { argv: PYENV_ROOT_ARGV, ...root },
  ];
}

/** `git pull --ff-only` in `root`: the whole upgrade of a clone. */
export function pullArgv(root: string): string[] {
  return ["git", "-C", root, "pull", "--ff-only"];
}

/**
 * The installer's layout: a clone in ~/.pyenv, its bin on PATH. `extra` is
 * merged in, for a knowledge test that moves the binary or the root.
 */
export function pyenvCloneMachine(version = "2.8.3", extra: Partial<SystemSpec> = {}): SystemSpec {
  return {
    platform: "linux",
    bin: { pyenv: "/home/u/.pyenv/bin/pyenv", git: "/usr/bin/git" },
    commands: pyenvAnswers(version, { stdout: "/home/u/.pyenv" }),
    fs: { "/home/u/.pyenv/.git": { kind: "dir" } },
    http: [PYENV_RELEASE],
    ...extra,
  };
}

/** pyenv from Homebrew; its data root holds no clone. */
export const PYENV_BREW_MACHINE: SystemSpec = installedVia("brew", "pyenv", {
  commands: pyenvAnswers("2.8.3", { stdout: "/Users/u/.pyenv" }),
  http: [PYENV_RELEASE],
});

const PYENV_ROW = { id: "pyenv", name: "pyenv", current: "2.8.3", latest: "2.9.0" };

/** `pyenv update` is a plugin, not a built-in: a clone is fast-forwarded with git. */
const PYENV_CLONE: ProviderContractCase = {
  scenario: "git clone",
  create: () => new PyenvProvider(),
  system: pyenvCloneMachine(),
  outdated: [{ ...PYENV_ROW, note: "clone git — git pull --ff-only" }],
  update: {
    packageId: "pyenv",
    installs: [pullArgv("/home/u/.pyenv")],
    onFailure: {
      success: false,
      message:
        "git pull --ff-only a échoué dans /home/u/.pyenv — HEAD détaché sur un tag, commits locaux ou branche divergente",
    },
  },
  updateAll: "collapsed",
};

/** Homebrew and Debian ship pyenv; nothing else can be named, so the rest is manual. */
const PYENV_HOMEBREW: ProviderContractCase = {
  scenario: "homebrew",
  create: () => new PyenvProvider(),
  system: PYENV_BREW_MACHINE,
  outdated: [{ ...PYENV_ROW, note: "via brew" }],
  update: { packageId: "pyenv", installs: [["brew", "upgrade", "--formula", "pyenv"]] },
  routes: delegationRoutes(
    "pyenv",
    { ids: { brew: "pyenv", apt: "pyenv" }, manualMessage: PYENV_MANUAL_MESSAGE },
    { commands: pyenvAnswers("2.8.3", { exitCode: 1 }) },
  ),
  updateAll: "collapsed",
};

/** A Debian package upgrades through sudo: the row joins the single elevated batch. */
const PYENV_APT: ProviderContractCase = {
  scenario: "apt package",
  create: () => new PyenvProvider(),
  system: installedVia("apt", "pyenv", {
    commands: pyenvAnswers("2.8.3", { stdout: "/home/u/.pyenv" }),
    http: [PYENV_RELEASE],
  }),
  outdated: [{ ...PYENV_ROW, note: "via apt", requiresAdmin: true }],
  update: {
    packageId: "pyenv",
    installs: [["sudo", "apt-get", "install", "--only-upgrade", "-y", "pyenv"]],
  },
  updateAll: "collapsed",
};

/** Nothing owns the binary: the row says so, and is not hidden as `manual`. */
const PYENV_UNKNOWN: ProviderContractCase = {
  scenario: "unknown install",
  create: () => new PyenvProvider(),
  system: {
    platform: "linux",
    bin: { pyenv: "/home/u/bin/pyenv" },
    commands: pyenvAnswers("2.8.3", { stdout: "/home/u/.pyenv" }),
    http: [PYENV_RELEASE],
  },
  outdated: [{ ...PYENV_ROW, note: "source inconnue — mise à jour manuelle" }],
  update: {
    packageId: "pyenv",
    installs: [],
    outcome: { success: false, skipped: true, message: PYENV_MANUAL_MESSAGE },
  },
  updateAll: "skipped",
};

/** `git describe` on a checkout past its tag: ahead, never behind. */
const PYENV_AHEAD: ProviderContractCase = {
  scenario: "checkout ahead of its tag",
  create: () => new PyenvProvider(),
  system: pyenvCloneMachine("2.9.0-12-gabc1234"),
  outdated: [],
  updateAll: "collapsed",
};

export const pythonCases: readonly ProviderContractCase[] = [
  PYENV_CLONE,
  PYENV_HOMEBREW,
  PYENV_APT,
  PYENV_UNKNOWN,
  PYENV_AHEAD,
];
