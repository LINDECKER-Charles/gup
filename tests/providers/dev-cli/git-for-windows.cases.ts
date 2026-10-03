import { GitForWindowsProvider } from "../../../src/providers/dev-cli/git-for-windows.js";
import { binaryPathVia, delegationRoutes } from "../../support/contract/installers.js";
import type { ProviderContractCase, UpdateRoute } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandAnswer, CommandScript, SystemSpec } from "../../support/system/types.js";

/**
 * Git for Windows: the `.windows.<patchlevel>` build of git, versioned
 * against the git-for-windows/git releases. A package manager that owns the
 * binary takes the upgrade; a standalone install falls back to git's own
 * `update-git-for-windows`, when the installation ships it (MinGit does not).
 */

export const GIT_VERSION_ARGV = ["git", "--version"];
export const UPDATER_PROBE_ARGV = ["git", "update-git-for-windows", "-h"];
export const UPDATER_RUN_ARGV = ["git", "update-git-for-windows", "--yes"];

export const UPDATER_BANNER =
  "usage: git update-git-for-windows [--gui] [--quiet] [--yes] [--test-callback=<shell-script>]";
/** MinGit has no built-in updater: git says so. */
const NO_UPDATER = "git: 'update-git-for-windows' is not a git command. See 'git --help'.";

export const GFW_MANUAL =
  "Télécharger l'installeur depuis https://gitforwindows.org/ et le relancer";
export const NOTHING_OFFERED = "aucune mise à jour proposée par git";
export const UPDATER_TOO_OLD =
  `l'updater intégré a refusé l'option --yes (version trop ancienne) — ${GFW_MANUAL}`;
const UPDATER_MISSING = `updater intégré absent de cette installation — ${GFW_MANUAL}`;

export const GFW_RELEASE = githubLatest("git-for-windows/git", "v2.55.0.windows.3");

/** Where the standalone installer puts git: nobody owns it. */
export const STANDALONE_GIT = "C:\\Program Files\\Git\\cmd\\git.exe";

interface GitMachine {
  /** What `git --version` prints. */
  readonly version: string;
  /** The answer to `git update-git-for-windows -h`, when the scan or update probes it. */
  readonly updater?: CommandAnswer;
  /** git's location; the standalone installer's by default. */
  readonly binary?: string;
}

function updaterProbe(answer: CommandAnswer | undefined): CommandScript[] {
  return answer ? [{ argv: UPDATER_PROBE_ARGV, ...answer }] : [];
}

/** Windows with git at `binary`, the releases answering 2.55.0.windows.3. */
export function gitMachine(machine: GitMachine): SystemSpec {
  return {
    platform: "win32",
    bin: { git: machine.binary ?? STANDALONE_GIT },
    commands: [
      { argv: GIT_VERSION_ARGV, stdout: machine.version },
      ...updaterProbe(machine.updater),
    ],
    http: [GFW_RELEASE],
  };
}

const BEHIND = "git version 2.55.0.windows.1";
const row = {
  id: "git-for-windows",
  name: "Git for Windows",
  current: "2.55.0.windows.1",
  latest: "2.55.0.windows.3",
};

/** A standalone install, on its own: the built-in updater runs, or the user is told to. */
const STANDALONE_ROUTES: readonly UpdateRoute[] = [
  {
    via: "built-in updater",
    system: gitMachine({ version: BEHIND, updater: { stdout: UPDATER_BANNER } }),
    installs: [UPDATER_RUN_ARGV],
    outcome: { message: NOTHING_OFFERED },
  },
  {
    via: "MinGit",
    system: gitMachine({ version: BEHIND, updater: { stdout: NO_UPDATER, exitCode: 1 } }),
    installs: [],
    outcome: { success: false, skipped: true, message: UPDATER_MISSING },
  },
];

/** Scoop owns git: its update, the other package managers', and the standalone fallbacks. */
const SCOOP: ProviderContractCase = {
  scenario: "scoop",
  create: () => new GitForWindowsProvider(),
  system: gitMachine({ version: BEHIND, binary: binaryPathVia("scoop", "git") }),
  outdated: [{ ...row, note: "via scoop" }],
  update: { packageId: "git-for-windows", installs: [["scoop", "update", "git"]] },
  routes: [
    ...delegationRoutes("git", {
      ids: { scoop: "git", choco: "git", winget: "Git.Git" },
      manualMessage: GFW_MANUAL,
    }).filter((route) => route.via !== "manual"),
    ...STANDALONE_ROUTES,
  ],
  updateAll: "collapsed",
};

/** Nobody owns git, and the installation ships the updater: git upgrades itself. */
const BUILT_IN_UPDATER: ProviderContractCase = {
  scenario: "built-in updater",
  create: () => new GitForWindowsProvider(),
  system: gitMachine({ version: BEHIND, updater: { stdout: UPDATER_BANNER } }),
  outdated: [{ ...row, note: "via git update-git-for-windows" }],
  update: {
    packageId: "git-for-windows",
    installs: [UPDATER_RUN_ARGV],
    // Exit 0 means the updater found nothing to install; 2 means it started the installer.
    outcome: { message: NOTHING_OFFERED },
    onFailure: { message: UPDATER_TOO_OLD },
  },
  updateAll: "collapsed",
};

/** MinGit: no updater, nobody to delegate to; the row says so and the update is skipped. */
const MINGIT: ProviderContractCase = {
  scenario: "MinGit",
  create: () => new GitForWindowsProvider(),
  system: gitMachine({ version: BEHIND, updater: { stdout: NO_UPDATER, exitCode: 1 } }),
  outdated: [{ ...row, note: "installeur à relancer manuellement" }],
  update: {
    packageId: "git-for-windows",
    installs: [],
    outcome: { success: false, skipped: true, message: UPDATER_MISSING },
  },
  updateAll: "collapsed",
};

/**
 * Nothing listed. The updater is there for `updateAll`, which still upgrades
 * whatever rows it is handed; the scan itself never probes it without a row.
 */
function nothingListed(scenario: string, version: string): ProviderContractCase {
  return {
    scenario,
    create: () => new GitForWindowsProvider(),
    system: gitMachine({ version, updater: { stdout: UPDATER_BANNER } }),
    outdated: [],
    updateAll: "collapsed",
  };
}

export const gitForWindowsCases: readonly ProviderContractCase[] = [
  SCOOP,
  BUILT_IN_UPDATER,
  MINGIT,
  nothingListed("up to date", "git version 2.55.0.windows.3"),
  // A release candidate past the latest final release: never "update" it down.
  nothingListed("release candidate ahead", "git version 2.56.0-rc1.windows.1"),
];
