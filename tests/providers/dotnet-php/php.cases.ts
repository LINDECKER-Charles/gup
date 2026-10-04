import { ComposerGlobalProvider } from "../../../src/providers/dotnet-php/composer-global.js";
import { ComposerSelfProvider } from "../../../src/providers/dotnet-php/composer-self.js";
import { PhiveProvider } from "../../../src/providers/dotnet-php/phive.js";
import { SymfonyCliProvider } from "../../../src/providers/dotnet-php/symfony-cli.js";
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
import type { HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * The PHP side of the dotnet-php domain: Composer (its global packages and
 * the binary itself), PHIVE and the Symfony CLI. The machines a knowledge
 * test starts from are exported; the rest stays private.
 */

const COMPOSER_BIN = "C:\\ProgramData\\ComposerSetup\\bin\\composer.bat";

// --- Composer global packages ---------------------------------------------------

const COMPOSER_OUTDATED_ARGV = [
  "composer",
  "global",
  "outdated",
  "-D",
  "--format=json",
  "--no-interaction",
];

/** Composer printing `report` for `composer global outdated --format=json`. */
export function composerGlobalMachine(report: unknown): SystemSpec {
  return {
    platform: "win32",
    bin: { composer: COMPOSER_BIN },
    commands: [{ argv: COMPOSER_OUTDATED_ARGV, stdout: JSON.stringify(report) }],
  };
}

/** One package current, one behind within its constraint, one behind a major. */
const COMPOSER_GLOBAL_REPORT = {
  installed: [
    {
      name: "laravel/installer",
      version: "v5.8.3",
      latest: "v5.8.3",
      "latest-status": "up-to-date",
    },
    {
      name: "friendsofphp/php-cs-fixer",
      version: "v3.59.3",
      latest: "v3.64.0",
      "latest-status": "semver-safe-update",
    },
    { name: "phpstan/phpstan", version: "1.11.0", latest: "2.0.1" },
  ],
};

const COMPOSER_GLOBAL: ProviderContractCase = {
  create: () => new ComposerGlobalProvider(),
  system: composerGlobalMachine(COMPOSER_GLOBAL_REPORT),
  outdated: [
    {
      id: "friendsofphp/php-cs-fixer",
      name: "friendsofphp/php-cs-fixer",
      current: "v3.59.3",
      latest: "v3.64.0",
      note: "semver-safe-update",
    },
    { id: "phpstan/phpstan", name: "phpstan/phpstan", current: "1.11.0", latest: "2.0.1" },
  ],
  update: {
    packageId: "phpstan/phpstan",
    installs: [["composer", "global", "update", "phpstan/phpstan", "--with-dependencies"]],
  },
  updateAll: "one-batch",
  // The global project is updated as a whole: one resolution, one lock file.
  batchInstalls: [["composer", "global", "update"]],
};

// --- Composer itself ------------------------------------------------------------

export const PACKAGIST_COMPOSER_URL = "https://repo.packagist.org/p2/composer/composer.json";

/** The `package.versions` map the provider reads, newest first. */
export function packagistRoute(versions: readonly string[]): HttpRoute {
  const entries = versions.map((version) => [version, { version }]);
  const json = { package: { versions: Object.fromEntries(entries) } };
  return { url: PACKAGIST_COMPOSER_URL, json };
}

/** Composer 2.7.7 on Windows; each scenario adds its Packagist answer. */
export const COMPOSER_SELF_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { composer: COMPOSER_BIN },
  commands: [
    {
      argv: ["composer", "--version", "--no-ansi"],
      stdout: "Composer version 2.7.7 2024-06-10 22:11:12",
    },
  ],
};

const COMPOSER_SELF: SelfUpdatingTool = {
  create: () => new ComposerSelfProvider(),
  system: COMPOSER_SELF_MACHINE,
  release: packagistRoute(["dev-main", "v2.8.0-RC1", "v2.8.0", "v2.7.7"]),
  row: { id: "composer-self", name: "Composer", current: "2.7.7", latest: "2.8.0" },
  // Packagist spells the version with a `v`; the banner does not.
  upToDate: packagistRoute(["v2.7.7"]),
  installs: [["composer", "self-update", "--no-interaction"]],
};

// --- PHIVE ----------------------------------------------------------------------

const PHIVE: SelfUpdatingTool = {
  create: () => new PhiveProvider(),
  system: {
    platform: "linux",
    bin: { phive: "/usr/local/bin/phive" },
    commands: [
      {
        argv: ["phive", "--version"],
        stdout:
          "Phive 0.15.2 - Copyright (C) 2015-2024 by Arne Blankerts, Sebastian Heuer and Contributors",
      },
    ],
  },
  release: githubLatest("phar-io/phive", "0.16.0"),
  row: { id: "phive", name: "PHIVE", current: "0.15.2", latest: "0.16.0" },
  upToDate: githubLatest("phar-io/phive", "0.15.2"),
  installs: [["phive", "selfupdate"]],
};

// --- Symfony CLI ----------------------------------------------------------------

/** No `self:update` any more: the upgrade goes to the installer that owns the binary. */
const SYMFONY_CLI: ReleasedTool = {
  create: () => new SymfonyCliProvider(),
  id: "symfony-cli",
  name: "Symfony CLI",
  binary: "symfony",
  probe: {
    argv: ["symfony", "version", "--no-ansi"],
    stdout:
      "Symfony CLI version 5.10.0 (c) 2021-2024 Fabien Potencier (2024-07-02T09:16:51Z - stable)",
  },
  current: "5.10.0",
  release: githubLatest("symfony-cli/symfony-cli", "v5.11.0"),
  latest: "5.11.0",
  upToDate: githubLatest("symfony-cli/symfony-cli", "v5.10.0"),
  delegation: {
    ids: {
      scoop: "symfony-cli",
      choco: "symfony-cli",
      winget: "SensioLabs.Symfony-Cli",
      brew: "symfony-cli",
    },
    manualMessage:
      "Télécharger https://github.com/symfony-cli/symfony-cli/releases et remplacer symfony.exe",
  },
};

export const phpCases: readonly ProviderContractCase[] = [
  COMPOSER_GLOBAL,
  ...[COMPOSER_SELF, PHIVE].flatMap(selfUpdatingToolCases),
  ...releasedToolCases(SYMFONY_CLI),
  // The Symfony CLI reads the GitHub API itself: a release without a tag lists nothing.
  nothingListedCase(SYMFONY_CLI, "release without a tag", {
    release: { url: SYMFONY_CLI.release.url, json: { name: "v5.11.0" } },
  }),
  // The banner tolerates a `v` before the version.
  nothingListedCase(SYMFONY_CLI, "v-prefixed banner, up to date", {
    probe: { argv: SYMFONY_CLI.probe.argv, stdout: "Symfony CLI version v5.11.0" },
  }),
];
