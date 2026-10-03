import { DotnetSdkProvider } from "../../../src/providers/dotnet-php/dotnet-sdk.js";
import { NugetProvider } from "../../../src/providers/dotnet-php/nuget.js";
import { delegationRoutes, installedVia } from "../../support/contract/installers.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import type { HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * The .NET side of the dotnet-php domain. Sample outputs are exported: the
 * knowledge tests of each provider start from the same machine.
 */

// --- .NET SDK ---------------------------------------------------------------

export const RELEASES_INDEX_URL =
  "https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json";
export const DOTNET_DOWNLOAD_PAGE = "https://dotnet.microsoft.com/download";

/** Shape read back off the live releases-index.json. */
export const RELEASES_INDEX = {
  "releases-index": [
    {
      "channel-version": "10.0",
      "latest-release": "10.0.0",
      "latest-sdk": "10.0.100",
      "support-phase": "active",
      "release-type": "sts",
    },
    {
      "channel-version": "9.0",
      "latest-sdk": "9.0.305",
      "support-phase": "eol",
      "release-type": "sts",
    },
    {
      "channel-version": "8.0",
      "latest-sdk": "8.0.414",
      "support-phase": "active",
      "release-type": "lts",
    },
  ],
};

export const RELEASES_ROUTE: HttpRoute = { url: RELEASES_INDEX_URL, json: RELEASES_INDEX };

/** `dotnet --list-sdks` with two SDKs side by side. */
export const LIST_SDKS_STDOUT = [
  "8.0.404 [C:\\Program Files\\dotnet\\sdk]",
  "9.0.101 [C:\\Program Files\\dotnet\\sdk]",
  "",
].join("\n");

export function dotnetManualMessage(channel: string): string {
  return (
    `Installateur système : récupérer le SDK ${channel} sur ${DOTNET_DOWNLOAD_PAGE}` +
    " (Homebrew Cask : brew upgrade --cask dotnet-sdk)"
  );
}

/** The SDK where its installers put it: a system prefix with no ownership signal. */
export const DOTNET_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { dotnet: "C:\\Program Files\\dotnet\\dotnet.exe" },
  commands: [{ argv: ["dotnet", "--list-sdks"], stdout: LIST_SDKS_STDOUT }],
  http: [RELEASES_ROUTE],
};

/**
 * The highest installed SDK (9.0.101) against its own channel only — the
 * newer 10.0 channel in the index stays out. Its install path says nothing
 * about who installed it, so the update is left to the user, while every
 * installer that does own the binary gets the channel-scoped id.
 */
const DOTNET_SDK: ProviderContractCase = {
  create: () => new DotnetSdkProvider(),
  system: DOTNET_MACHINE,
  outdated: [
    {
      id: "9.0",
      name: ".NET SDK 9.0",
      current: "9.0.101",
      latest: "9.0.305",
      note: "STS · fin de support",
    },
  ],
  update: {
    packageId: "9.0",
    installs: [],
    outcome: { success: false, skipped: true, message: dotnetManualMessage("9.0") },
  },
  routes: delegationRoutes(
    "dotnet",
    {
      // No scoop id: its manifest tracks the newest channel, a major migration.
      ids: {
        winget: "Microsoft.DotNet.SDK.9",
        choco: "dotnet-9.0-sdk",
        brew: "dotnet",
        apt: "dotnet-sdk-9.0",
        dnf: "dotnet-sdk-9.0",
      },
      manualMessage: dotnetManualMessage("9.0"),
    },
    { http: [RELEASES_ROUTE] },
  ),
  updateAll: "skipped",
};

/** A distro-packaged SDK on Linux: its row joins the CLI's single sudo batch. */
export const DOTNET_APT_MACHINE: SystemSpec = installedVia("apt", "dotnet", {
  commands: [{ argv: ["dotnet", "--list-sdks"], stdout: "8.0.404 [/usr/lib/dotnet/sdk]" }],
  http: [RELEASES_ROUTE],
});

const DOTNET_SDK_APT: ProviderContractCase = {
  scenario: "apt package",
  create: () => new DotnetSdkProvider(),
  system: DOTNET_APT_MACHINE,
  outdated: [
    {
      id: "8.0",
      name: ".NET SDK 8.0",
      current: "8.0.404",
      latest: "8.0.414",
      note: "LTS · support actif",
      requiresAdmin: true,
    },
  ],
  update: {
    packageId: "8.0",
    installs: [["sudo", "apt-get", "install", "--only-upgrade", "-y", "dotnet-sdk-8.0"]],
  },
  updateAll: "per-package",
};

// --- NuGet CLI ----------------------------------------------------------------

export const NUGET_FLAT_CONTAINER =
  "https://api.nuget.org/v3-flatcontainer/nuget.commandline/index.json";
export const NUGET_FORCED_HELP_ARGV = ["nuget", "help", "-ForceEnglishOutput"];
export const NUGET_SELF_UPDATE = ["nuget", "update", "-self", "-NonInteractive"];

/** `nuget help`: the four-part file version banner, then the help text. */
export const NUGET_HELP_STDOUT = [
  "NuGet Version: 6.11.0.0",
  "usage: NuGet <command> [args] [options]",
  "Type 'NuGet help <command>' for help on a specific command.",
  "",
  "Available commands:",
  "",
  " add          Adds a package to a package source",
  "",
].join("\n");

/** The flat container lists every version: unordered, previews included. */
export const NUGET_VERSIONS = ["6.9.0", "6.12.0", "6.11.0", "7.0.0-preview.1"];

export const NUGET_WINDOWS_FAILURE =
  "nuget.exe se remplace sur place : vérifier les droits d'écriture sur son dossier, ou relancer depuis un terminal administrateur";

/** nuget.exe 6.11 where `binary` puts it, nuget.org answering `versions`. */
export function nugetMachine(
  platform: SystemSpec["platform"],
  versions: readonly unknown[] = NUGET_VERSIONS,
): SystemSpec {
  return {
    platform,
    bin: { nuget: platform === "win32" ? "C:\\Tools\\nuget.exe" : "/usr/local/bin/nuget" },
    commands: [{ argv: NUGET_FORCED_HELP_ARGV, stdout: NUGET_HELP_STDOUT }],
    http: [{ url: NUGET_FLAT_CONTAINER, json: { versions } }],
  };
}

const NUGET_ROW = { id: "nuget", name: "NuGet CLI", current: "6.11.0.0", latest: "6.12.0" };

const NUGET: ProviderContractCase = {
  scenario: "windows",
  create: () => new NugetProvider(),
  system: nugetMachine("win32"),
  outdated: [NUGET_ROW],
  update: {
    packageId: "nuget",
    installs: [NUGET_SELF_UPDATE],
    onFailure: { success: false, message: NUGET_WINDOWS_FAILURE },
  },
  updateAll: "collapsed",
};

/** Under Mono the self-update is attempted, and a failure names the manual way. */
const NUGET_UNDER_MONO: ProviderContractCase = {
  scenario: "mono",
  create: () => new NugetProvider(),
  system: nugetMachine("linux"),
  outdated: [{ ...NUGET_ROW, note: "sous Mono : update -self non garanti" }],
  update: {
    packageId: "nuget",
    installs: [NUGET_SELF_UPDATE],
    onFailure: {
      success: false,
      skipped: true,
      message:
        "`nuget update -self` a échoué sous Mono — retélécharger https://dist.nuget.org/win-x86-commandline/latest/nuget.exe",
    },
  },
  updateAll: "collapsed",
};

export const dotnetPhpCases: readonly ProviderContractCase[] = [
  DOTNET_SDK,
  DOTNET_SDK_APT,
  NUGET,
  NUGET_UNDER_MONO,
];
