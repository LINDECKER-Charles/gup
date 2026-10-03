import { GitForWindowsProvider } from "../../../src/providers/dev-cli/git-for-windows.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { githubLatest } from "../../support/system/releases.js";
import {
  GIT_VERSION_ARGV,
  NOTHING_OFFERED,
  STANDALONE_GIT,
  UPDATER_PROBE_ARGV,
  UPDATER_RUN_ARGV,
  UPDATER_TOO_OLD,
} from "./git-for-windows.cases.js";

/**
 * Git for Windows as recorded on Windows 11 by `npm run fixtures:record`: its
 * real `git --version`, and the built-in updater's help, which goes to stderr
 * with exit 1. Its row is a golden.
 */
const GIT_FOR_WINDOWS_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows",
  create: () => new GitForWindowsProvider(),
  system: {
    platform: "win32",
    bin: { git: STANDALONE_GIT },
    commands: [
      { argv: GIT_VERSION_ARGV, stdout: fixture("providers/dev-cli/git-for-windows/version.win32.txt") },
      {
        argv: UPDATER_PROBE_ARGV,
        stderr: fixture("providers/dev-cli/git-for-windows/updater-help.win32.txt"),
        exitCode: 1,
      },
    ],
    http: [githubLatest("git-for-windows/git", "v2.56.0.windows.1")],
  },
  outdated: golden("dev-cli", "git-for-windows.recorded.win32"),
  update: {
    packageId: "git-for-windows",
    installs: [UPDATER_RUN_ARGV],
    outcome: { message: NOTHING_OFFERED },
    onFailure: { message: UPDATER_TOO_OLD },
  },
  updateAll: "collapsed",
};

export const recordedDevCliCases: readonly ProviderContractCase[] = [GIT_FOR_WINDOWS_RECORDED];
