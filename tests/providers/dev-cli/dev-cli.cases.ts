import { DeltaProvider } from "../../../src/providers/dev-cli/delta.js";
import { GhExtensionsProvider } from "../../../src/providers/dev-cli/gh-extensions.js";
import { GlabProvider } from "../../../src/providers/dev-cli/glab.js";
import { JujutsuProvider } from "../../../src/providers/dev-cli/jj.js";
import { LazydockerProvider } from "../../../src/providers/dev-cli/lazydocker.js";
import { LazygitProvider } from "../../../src/providers/dev-cli/lazygit.js";
import { TeaProvider } from "../../../src/providers/dev-cli/tea.js";
import {
  nothingListedCase,
  type ReleasedTool,
  releasedToolCases,
} from "../../support/contract/released-tool.js";
import {
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Developer CLIs around git and its forges. Most are single binaries released
 * on GitHub (or Gitea) whose upgrade goes to the installer that owns them;
 * glab updates itself; gh extensions are listed by gh and upgraded by it. The
 * machines and outputs a knowledge test starts from are exported.
 */

// --- released single binaries ---------------------------------------------------

const DELTA: ReleasedTool = {
  create: () => new DeltaProvider(),
  id: "delta",
  name: "git-delta",
  binary: "delta",
  probe: { argv: ["delta", "--version"], stdout: "delta 0.17.0" },
  current: "0.17.0",
  release: githubLatest("dandavison/delta", "0.18.2"),
  latest: "0.18.2",
  upToDate: githubLatest("dandavison/delta", "0.17.0"),
  delegation: {
    // The binary is `delta`, the homebrew-core formula `git-delta`.
    ids: { scoop: "delta", choco: "delta", winget: "dandavison.delta", brew: "git-delta" },
    manualMessage:
      "Télécharger https://github.com/dandavison/delta/releases ou `cargo install git-delta`",
  },
};

const JUJUTSU: ReleasedTool = {
  create: () => new JujutsuProvider(),
  id: "jj",
  name: "Jujutsu",
  binary: "jj",
  probe: { argv: ["jj", "--version"], stdout: "jj 0.18.0" },
  current: "0.18.0",
  release: githubLatest("jj-vcs/jj", "v0.21.0"),
  latest: "0.21.0",
  upToDate: githubLatest("jj-vcs/jj", "v0.18.0"),
  delegation: {
    ids: { scoop: "jj", winget: "martinvonz.jj", brew: "jj" },
    manualMessage:
      "Télécharger https://github.com/jj-vcs/jj/releases ou `cargo install --locked jj-cli`",
  },
};

const LAZYDOCKER: ReleasedTool = {
  create: () => new LazydockerProvider(),
  id: "lazydocker",
  name: "Lazydocker",
  binary: "lazydocker",
  probe: {
    argv: ["lazydocker", "--version"],
    stdout: "Version: 0.23.1\nDate: 2024-01-01T00:00:00Z\nBuildSource: binaryRelease",
  },
  current: "0.23.1",
  release: githubLatest("jesseduffield/lazydocker", "v0.23.3"),
  latest: "0.23.3",
  upToDate: githubLatest("jesseduffield/lazydocker", "v0.23.1"),
  delegation: {
    ids: {
      scoop: "lazydocker",
      choco: "lazydocker",
      winget: "JesseDuffield.Lazydocker",
      brew: "lazydocker",
    },
    manualMessage:
      "Télécharger https://github.com/jesseduffield/lazydocker/releases et remplacer lazydocker.exe",
  },
};

const LAZYGIT: ReleasedTool = {
  create: () => new LazygitProvider(),
  id: "lazygit",
  name: "Lazygit",
  binary: "lazygit",
  probe: {
    argv: ["lazygit", "--version"],
    stdout:
      "commit=a1b2c3d, build date=2024-06-01T00:00:00Z, build source=binaryRelease, " +
      "version=0.42.0, os=windows, arch=amd64, git version=2.45.1.windows.1",
  },
  current: "0.42.0",
  release: githubLatest("jesseduffield/lazygit", "v0.44.1"),
  latest: "0.44.1",
  upToDate: githubLatest("jesseduffield/lazygit", "v0.42.0"),
  delegation: {
    ids: {
      scoop: "lazygit",
      choco: "lazygit",
      winget: "JesseDuffield.lazygit",
      brew: "lazygit",
    },
    manualMessage:
      "Télécharger https://github.com/jesseduffield/lazygit/releases et remplacer lazygit.exe",
  },
};

/** tea lives on gitea.com: its latest release comes from the Gitea API, tags with a `v`. */
function giteaLatest(tagName: string): HttpRoute {
  return {
    url: "https://gitea.com/api/v1/repos/gitea/tea/releases/latest",
    json: { tag_name: tagName },
  };
}

const TEA: ReleasedTool = {
  create: () => new TeaProvider(),
  id: "tea",
  name: "Gitea CLI",
  binary: "tea",
  probe: { argv: ["tea", "--version"], stdout: "Tea version 0.9.2" },
  current: "0.9.2",
  release: giteaLatest("v0.10.0"),
  latest: "0.10.0",
  upToDate: giteaLatest("v0.9.2"),
  delegation: {
    // homebrew-core's `tea` is this CLI.
    ids: { scoop: "tea", brew: "tea" },
    manualMessage: "Télécharger https://gitea.com/gitea/tea/releases et remplacer tea.exe",
  },
};

/** A valid Gitea answer naming no tag: nothing to compare against. */
const TEA_WITHOUT_TAG = nothingListedCase(TEA, "release without a tag", {
  release: { ...giteaLatest(""), json: {} },
});

// --- glab, which updates itself -------------------------------------------------

const GLAB: SelfUpdatingTool = {
  create: () => new GlabProvider(),
  system: {
    platform: "win32",
    bin: { glab: "C:\\Program Files (x86)\\glab\\glab.exe" },
    commands: [{ argv: ["glab", "--version"], stdout: "glab version 1.40.0 (2024-05-01)" }],
  },
  release: githubLatest("profclems/glab", "v1.42.0"),
  row: { id: "glab", name: "GitLab CLI", current: "1.40.0", latest: "1.42.0" },
  upToDate: githubLatest("profclems/glab", "v1.40.0"),
  installs: [["glab", "update"]],
};

// --- gh extensions --------------------------------------------------------------

export const GH_EXTENSION_LIST = ["gh", "extension", "list"];

/** `gh api` asking a repo's latest release tag, as the provider spawns it. */
export function ghReleaseProbe(repo: string, tag: string, exitCode = 0): CommandScript {
  const argv = ["gh", "api", `repos/${repo}/releases/latest`, "--jq", ".tag_name"];
  return { argv, stdout: tag, exitCode };
}

/** gh on PATH printing `listing` for `gh extension list`, plus `probes`. */
export function ghMachine(listing: string, probes: readonly CommandScript[] = []): SystemSpec {
  return {
    platform: "win32",
    bin: { gh: "C:\\Program Files\\GitHub CLI\\gh.exe" },
    commands: [{ argv: GH_EXTENSION_LIST, stdout: listing }, ...probes],
  };
}

const GH_EXTENSIONS: ProviderContractCase = {
  create: () => new GhExtensionsProvider(),
  system: ghMachine(
    [
      "NAME        REPO                VERSION",
      "gh-dash     dlvhdr/gh-dash      v4.1.0",
      "gh-poi      seachicken/gh-poi   v0.9.10",
    ].join("\n"),
    [ghReleaseProbe("dlvhdr/gh-dash", "v4.7.0"), ghReleaseProbe("seachicken/gh-poi", "v0.12.0")],
  ),
  outdated: [
    { id: "gh-dash", name: "gh-dash", current: "v4.1.0", latest: "v4.7.0" },
    { id: "gh-poi", name: "gh-poi", current: "v0.9.10", latest: "v0.12.0" },
  ],
  update: { packageId: "gh-dash", installs: [["gh", "extension", "upgrade", "gh-dash"]] },
  // gh upgrades every extension in one command; each row shares its outcome.
  updateAll: "one-batch",
  batchInstalls: [["gh", "extension", "upgrade", "--all"]],
};

export const devCliCases: readonly ProviderContractCase[] = [
  ...[DELTA, JUJUTSU, LAZYDOCKER, LAZYGIT, TEA].flatMap(releasedToolCases),
  TEA_WITHOUT_TAG,
  ...selfUpdatingToolCases(GLAB),
  GH_EXTENSIONS,
];
