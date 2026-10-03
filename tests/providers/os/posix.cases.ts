import { BrewCaskProvider } from "../../../src/providers/os/brew-cask.js";
import { BrewProvider } from "../../../src/providers/os/brew.js";
import { FinkProvider } from "../../../src/providers/os/fink.js";
import { MacPortsProvider } from "../../../src/providers/os/macports.js";
import { MasProvider } from "../../../src/providers/os/mas.js";
import { NixProvider } from "../../../src/providers/os/nix.js";
import { PkginProvider } from "../../../src/providers/os/pkgin.js";
import { PkgxProvider } from "../../../src/providers/os/pkgx.js";
import { SparkleProvider } from "../../../src/providers/os/sparkle.js";
import { delegationRoutes } from "../../support/contract/installers.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * macOS and Linux package managers. Sample outputs are exported: the
 * knowledge tests of each provider start from the same nominal machine.
 */

// --- Homebrew ---------------------------------------------------------------

export const BREW_FORMULAE_ARGV = ["brew", "outdated", "--formula", "--json=v2"];
export const BREW_CASKS_ARGV = ["brew", "outdated", "--cask", "--json=v2"];

/** `brew outdated --formula --json=v2`: a pinned formula, a formula with two kegs. */
export const BREW_FORMULAE_JSON = JSON.stringify({
  formulae: [
    {
      name: "libnghttp2",
      installed_versions: ["1.69.0"],
      current_version: "1.70.0",
      pinned: false,
      pinned_version: null,
    },
    {
      name: "php@8.3",
      installed_versions: ["8.3.31", "8.3.32"],
      current_version: "8.3.33",
      pinned: false,
    },
    { name: "node", installed_versions: ["22.1.0"], current_version: "24.0.0", pinned: true },
  ],
  casks: [],
});

/** `brew outdated --cask --json=v2`: the array form and the singular installed_version. */
export const BREW_CASKS_JSON = JSON.stringify({
  formulae: [],
  casks: [
    { name: "iterm2", installed_versions: ["3.4.23"], current_version: "3.5.0" },
    { name: "visual-studio-code", installed_version: "1.89.0", current_version: "1.90.0" },
  ],
});

export const BREW_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { brew: "/opt/homebrew/bin/brew" },
  commands: [
    { argv: BREW_FORMULAE_ARGV, stdout: BREW_FORMULAE_JSON },
    { argv: BREW_CASKS_ARGV, stdout: BREW_CASKS_JSON },
  ],
};

const BREW: ProviderContractCase = {
  scenario: "macos",
  create: () => new BrewProvider(),
  system: BREW_MACHINE,
  outdated: [
    { id: "libnghttp2", name: "libnghttp2", current: "1.69.0", latest: "1.70.0" },
    { id: "php@8.3", name: "php@8.3", current: "8.3.32", latest: "8.3.33" },
    { id: "node", name: "node", current: "22.1.0", latest: "24.0.0", note: "pinned" },
  ],
  update: { packageId: "libnghttp2", installs: [["brew", "upgrade", "--formula", "libnghttp2"]] },
  updateAll: "one-batch",
  // One resolution pass for the whole set; brew skips pinned formulae itself.
  batchInstalls: [["brew", "upgrade", "--formula"]],
};

/** Linuxbrew: the same provider, the same envelope, under its own prefix. */
const LINUXBREW: ProviderContractCase = {
  scenario: "linuxbrew",
  create: () => new BrewProvider(),
  system: {
    platform: "linux",
    bin: { brew: "/home/linuxbrew/.linuxbrew/bin/brew" },
    commands: [
      {
        argv: BREW_FORMULAE_ARGV,
        stdout: JSON.stringify({
          formulae: [{ name: "gh", installed_versions: ["2.40.0"], current_version: "2.42.1" }],
          casks: [],
        }),
      },
    ],
  },
  outdated: [{ id: "gh", name: "gh", current: "2.40.0", latest: "2.42.1" }],
  update: { packageId: "gh", installs: [["brew", "upgrade", "--formula", "gh"]] },
  updateAll: "one-batch",
  batchInstalls: [["brew", "upgrade", "--formula"]],
};

const BREW_CASK: ProviderContractCase = {
  create: () => new BrewCaskProvider(),
  system: BREW_MACHINE,
  outdated: [
    { id: "iterm2", name: "iterm2", current: "3.4.23", latest: "3.5.0" },
    {
      id: "visual-studio-code",
      name: "visual-studio-code",
      current: "1.89.0",
      latest: "1.90.0",
    },
  ],
  update: { packageId: "iterm2", installs: [["brew", "upgrade", "--cask", "iterm2"]] },
  updateAll: "one-batch",
  batchInstalls: [["brew", "upgrade", "--cask"]],
};

// --- Mac App Store ------------------------------------------------------------

export const MAS_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { mas: "/opt/homebrew/bin/mas" },
  commands: [
    {
      argv: ["mas", "outdated"],
      stdout: "497799835 Xcode (14.2 -> 14.3)\n409183694 Keynote for Mac (12.2.1 -> 13.0)",
    },
  ],
};

const MAS: ProviderContractCase = {
  create: () => new MasProvider(),
  system: MAS_MACHINE,
  outdated: [
    { id: "497799835", name: "Xcode", current: "14.2", latest: "14.3" },
    { id: "409183694", name: "Keynote for Mac", current: "12.2.1", latest: "13.0" },
  ],
  // The numeric App Store id is the upgrade target.
  update: { packageId: "497799835", installs: [["mas", "upgrade", "497799835"]] },
  updateAll: "one-batch",
  batchInstalls: [["mas", "upgrade"]],
};

// --- MacPorts -----------------------------------------------------------------

export const PORT_OUTDATED = [
  "The following installed ports are outdated:",
  "gettext                        0.21_0 < 0.22_1",
  "libiconv                       1.16_1 < 1.17_0",
].join("\n");

/** A MacPorts tree; `elevated` says whether gup already runs as root. */
export function macportsMachine(elevated: boolean): SystemSpec {
  return {
    platform: "darwin",
    bin: { port: "/opt/local/bin/port" },
    commands: [{ argv: ["port", "outdated"], stdout: PORT_OUTDATED }],
    elevated,
  };
}

const PORT_ROWS = [
  { id: "gettext", name: "gettext", current: "0.21_0", latest: "0.22_1" },
  { id: "libiconv", name: "libiconv", current: "1.16_1", latest: "1.17_0" },
];

/** Every write needs root: rows join the CLI's single sudo batch. */
const MACPORTS_AS_USER: ProviderContractCase = {
  scenario: "regular user",
  create: () => new MacPortsProvider(),
  system: macportsMachine(false),
  outdated: PORT_ROWS.map((row) => ({ ...row, requiresAdmin: true })),
  update: { packageId: "gettext", installs: [["sudo", "port", "-N", "upgrade", "gettext"]] },
  updateAll: "one-batch",
  batchInstalls: [["sudo", "port", "-N", "upgrade", "outdated"]],
};

/** Inside the root batch the rows update in place. */
const MACPORTS_AS_ROOT: ProviderContractCase = {
  scenario: "root",
  create: () => new MacPortsProvider(),
  system: macportsMachine(true),
  outdated: PORT_ROWS,
  updateAll: "one-batch",
};

// --- Nix --------------------------------------------------------------------

export const NIX_TAGS_URL = "https://api.github.com/repos/NixOS/nix/tags?per_page=100";
export const NIX_UPSTREAM_VERSION = "nix (Nix) 2.28.3";
/** A Determinate build: its product version first, the Nix version last. */
export const NIX_DETERMINATE_VERSION = "nix (Determinate Nix 3.21.9) 2.35.1";
export const NIX_BIN = "/nix/var/nix/profiles/default/bin/nix";
export const NIX_ENV_BIN = "/nix/var/nix/profiles/default/bin/nix-env";
export const NIX_PROFILE_UPGRADE_ARGV = [
  "nix",
  "--extra-experimental-features",
  "nix-command flakes",
  "profile",
  "upgrade",
  "--all",
];

/** `/repos/NixOS/nix/tags`: repository order, a pre-release and a pointer tag. */
export const NIX_TAGS_BODY = [
  { name: "2.28.3", commit: { sha: "aaa" } },
  { name: "2.30.0", commit: { sha: "bbb" } },
  { name: "2.9.0", commit: { sha: "ccc" } },
  { name: "2.31.0-pre", commit: { sha: "ddd" } },
  { name: "latest", commit: { sha: "eee" } },
];

export const NIX_PROFILE_ROW = {
  id: "profile",
  name: "profil utilisateur",
  current: "?",
  latest: "refresh",
  note: "nix profile upgrade --all — réévalue chaque flake du profil",
};

/** A single-user upstream install on macOS, with a classic user profile. */
export const NIX_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { nix: NIX_BIN, "nix-env": NIX_ENV_BIN },
  commands: [{ argv: ["nix", "--version"], stdout: NIX_UPSTREAM_VERSION }],
  http: [{ url: NIX_TAGS_URL, json: NIX_TAGS_BODY }],
  fs: { "/Users/u/.nix-profile": { kind: "dir" } },
};

const NIX: ProviderContractCase = {
  scenario: "standalone",
  create: () => new NixProvider(),
  system: NIX_MACHINE,
  outdated: [
    {
      id: "nix",
      name: "nix",
      current: "2.28.3",
      latest: "2.30.0",
      note: "nix upgrade-nix — install mono-utilisateur uniquement",
    },
    NIX_PROFILE_ROW,
  ],
  update: {
    packageId: "nix",
    // Stable command: no experimental-features flag, unlike `nix profile`.
    installs: [["nix", "upgrade-nix"]],
    onFailure: {
      success: false,
      message:
        "nix upgrade-nix a échoué : sur une install multi-utilisateur le profil " +
        "appartient à root, et un profil géré par nix profile est refusé par " +
        "upgrade-nix.",
    },
  },
  updateAll: "per-package",
};

/** Determinate ships its own updater: the binary row is reported, never upgraded here. */
const NIX_DETERMINATE: ProviderContractCase = {
  scenario: "determinate",
  create: () => new NixProvider(),
  system: {
    platform: "linux",
    bin: { nix: NIX_BIN },
    commands: [{ argv: ["nix", "--version"], stdout: NIX_DETERMINATE_VERSION }],
    http: [githubLatest("DeterminateSystems/nix-src", "v3.22.0")],
  },
  outdated: [
    {
      id: "nix",
      name: "nix",
      current: "3.21.9",
      latest: "3.22.0",
      note: "Determinate Nix — mise à jour par sudo determinate-nixd upgrade",
    },
  ],
  update: {
    packageId: "nix",
    installs: [],
    outcome: {
      success: false,
      skipped: true,
      message:
        "Determinate Nix se met à jour avec sa propre commande : sudo determinate-nixd upgrade",
    },
  },
  updateAll: "skipped",
};

// --- Sparkle ------------------------------------------------------------------

export const PLUTIL_BIN = "/usr/bin/plutil";
export const TRANSMIT_PLIST = "/Applications/Transmit.app/Contents/Info.plist";
export const ITERM_PLIST = "/Applications/iTerm.app/Contents/Info.plist";
export const TRANSMIT_FEED = "https://www.panic.com/updates/transmit5.xml";
export const ITERM_FEED = "https://iterm2.com/appcasts/final_modern.xml";
export const SPARKLE_NOTE = "Sparkle — updater intégré à l'app";

/** Sparkle 2's recommended shape: versions as child elements of <item>. */
export const APPCAST_ELEMENT_SHAPE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Transmit 5</title>
    <link>https://www.panic.com/updates/transmit5.xml</link>
    <item>
      <title>Version 5.10.4</title>
      <pubDate>Tue, 03 Jun 2025 16:04:00 +0000</pubDate>
      <sparkle:version>5104</sparkle:version>
      <sparkle:shortVersionString>5.10.4</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>11.0</sparkle:minimumSystemVersion>
      <enclosure url="https://download.panic.com/transmit/Transmit%205.10.4.zip" length="41234567" type="application/octet-stream" sparkle:edSignature="Ky/9v0k="/>
    </item>
    <item>
      <title>Version 5.10.3</title>
      <pubDate>Mon, 12 May 2025 09:00:00 +0000</pubDate>
      <sparkle:version>5103</sparkle:version>
      <sparkle:shortVersionString>5.10.3</sparkle:shortVersionString>
      <enclosure url="https://download.panic.com/transmit/Transmit%205.10.3.zip" length="41000000" type="application/octet-stream"/>
    </item>
  </channel>
</rss>`;

/** The legacy shape, still deployed (iTerm2's live feed): attributes on <enclosure>. */
export const APPCAST_ATTRIBUTE_SHAPE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>iTerm2</title>
    <item>
      <title>3.5.14</title>
      <description>Bug fixes.</description>
      <pubDate>Thu, 10 Apr 2025 12:00:00 -0700</pubDate>
      <enclosure sparkle:version="3.5.14" sparkle:shortVersionString="3.5.14" url="https://iterm2.com/downloads/stable/iTerm2-3_5_14.zip" length="30000000" type="application/octet-stream"/>
    </item>
    <item>
      <title>3.5.13</title>
      <enclosure sparkle:version="3.5.13" sparkle:shortVersionString="3.5.13" url="https://iterm2.com/downloads/stable/iTerm2-3_5_13.zip" length="29000000" type="application/octet-stream"/>
    </item>
  </channel>
</rss>`;

/** Keys of one bundle's Info.plist, as `plutil -extract <key> raw` reads them. */
export type PlistKeys = Readonly<Record<string, string>>;

/** `plutil -extract <key> raw -o - <plist>` for each key; absent keys exit 1. */
export function plutilScripts(plist: string, keys: PlistKeys): CommandScript[] {
  return ["SUFeedURL", "CFBundleShortVersionString", "CFBundleVersion"].map((key) => {
    const value = keys[key];
    const argv = ["plutil", "-extract", key, "raw", "-o", "-", plist];
    return value === undefined ? { argv, exitCode: 1 } : { argv, stdout: `${value}\n` };
  });
}

/** A Mac whose bundles carry the given Info.plist keys (plist path → keys). */
export function sparkleMachine(
  bundles: Readonly<Record<string, PlistKeys>>,
  http: readonly HttpRoute[] = [],
): SystemSpec {
  return {
    platform: "darwin",
    bin: { plutil: PLUTIL_BIN },
    fs: Object.fromEntries(Object.keys(bundles).map((plist) => [plist, { kind: "file" }])),
    commands: Object.entries(bundles).flatMap(([plist, keys]) => plutilScripts(plist, keys)),
    http,
  };
}

const SPARKLE: ProviderContractCase = {
  create: () => new SparkleProvider(),
  system: sparkleMachine(
    {
      [TRANSMIT_PLIST]: {
        SUFeedURL: TRANSMIT_FEED,
        CFBundleShortVersionString: "5.10.3",
        CFBundleVersion: "5103",
      },
      [ITERM_PLIST]: {
        SUFeedURL: ITERM_FEED,
        CFBundleShortVersionString: "3.5.13",
        CFBundleVersion: "3.5.13",
      },
    },
    [
      { url: TRANSMIT_FEED, body: APPCAST_ELEMENT_SHAPE },
      { url: ITERM_FEED, body: APPCAST_ATTRIBUTE_SHAPE },
    ],
  ),
  // In directory listing order.
  outdated: [
    { id: "Transmit", name: "Transmit", current: "5.10.3", latest: "5.10.4", note: SPARKLE_NOTE },
    { id: "iTerm", name: "iTerm", current: "3.5.13", latest: "3.5.14", note: SPARKLE_NOTE },
  ],
  // gup reports, Sparkle applies: never someone else's in-app updater.
  update: {
    packageId: "Transmit",
    installs: [],
    outcome: {
      success: false,
      skipped: true,
      message:
        "Ouvrir Transmit, puis le menu de l'application → « Check for Updates… » : " +
        "Sparkle télécharge et vérifie la signature lui-même.",
    },
  },
  updateAll: "skipped",
};

// --- Fink ---------------------------------------------------------------------

export const FINK_LIST_ARGV = ["fink", "list", "--tab", "--outdated"];

/** `fink list --tab --outdated`: status, name, version, description. */
export const FINK_OUTDATED_TAB = [
  "(i)\tgettext\t0.22.5-1\tMessage localization support",
  "(i)\tlibiconv\t1.17-1\tCharacter set conversion library",
].join("\n");

/** A Fink tree; `elevated` says whether gup already runs as root. */
export function finkMachine(elevated: boolean, stdout = FINK_OUTDATED_TAB): SystemSpec {
  return {
    platform: "darwin",
    bin: { fink: "/sw/bin/fink" },
    commands: [{ argv: FINK_LIST_ARGV, stdout }],
    elevated,
  };
}

/** One aggregate row: fink's list carries the newest version, never the installed one. */
const FINK: ProviderContractCase = {
  create: () => new FinkProvider(),
  system: finkMachine(false),
  outdated: [
    {
      id: "fink",
      aggregate: true,
      requiresAdmin: true,
      name: "Fink (paquets installés)",
      current: "?",
      latest: "2 pkg",
      note: "sudo fink --yes update-all — d'après le dernier fink selfupdate",
    },
  ],
  update: { packageId: "fink", installs: [["sudo", "fink", "--yes", "update-all"]] },
  updateAll: "one-batch",
};

// --- pkgin --------------------------------------------------------------------

export const PKGIN_LIST_ARGV = ["pkgin", "list"];
export const PKGIN_LESSER_ARGV = ["pkgin", "-l", "<", "list"];
export const PKGIN_EQUAL_ARGV = ["pkgin", "-l", "=", "list"];

/** `pkgin list`: one installed package per line, name-version then comment. */
export const PKGIN_LIST = [
  "bash-5.2.15 The GNU Bourne Again Shell",
  "nginx-1.24.0 Highly performant web server",
  "php-8.1.0 PHP Hypertext Preprocessor version 8.1",
].join("\n");

/** `pkgin -l "<" list`: remote builds that outrank the installed one, in no order. */
export const PKGIN_LESSER = [
  "nginx-1.26.2 <    Highly performant web server",
  "php-8.2.20 <      PHP Hypertext Preprocessor version 8.2",
  "php-8.3.1 <       PHP Hypertext Preprocessor version 8.3",
  "unbound-1.19.0 <  DNS resolver",
].join("\n");

const PKGIN_BIN = "/opt/pkg/bin/pkgin";

/** A pkgsrc prefix whose catalogue holds newer builds; nothing pending after an upgrade. */
export const PKGIN_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { pkgin: PKGIN_BIN },
  commands: [
    { argv: PKGIN_LIST_ARGV, stdout: PKGIN_LIST },
    { argv: PKGIN_LESSER_ARGV, stdout: PKGIN_LESSER, afterInstall: { stdout: "" } },
  ],
};

const PKGIN: ProviderContractCase = {
  create: () => new PkginProvider(),
  system: PKGIN_MACHINE,
  outdated: [
    { id: "nginx", name: "nginx", current: "1.24.0", latest: "1.26.2", requiresAdmin: true },
    {
      id: "php",
      name: "php",
      current: "8.1.0",
      latest: "8.3.1",
      note: "2 candidates — preferred.conf peut en imposer une autre",
      requiresAdmin: true,
    },
  ],
  // `install` is the single-package lever; a regular user goes through sudo.
  update: { packageId: "nginx", installs: [["sudo", "pkgin", "-y", "install", "nginx"]] },
  updateAll: "one-batch",
  batchInstalls: [["sudo", "pkgin", "-y", "upgrade"]],
};

// --- pkgx ---------------------------------------------------------------------

export const PKGX_RELEASES_URL = "https://api.github.com/repos/pkgxdev/pkgx/releases?per_page=30";
export const PKGX_MANUAL_MESSAGE =
  "Relancer l'installeur officiel, qui met aussi pkgx à jour : curl -LSsf https://pkgx.sh | sh";

/**
 * `/releases`, most recent first: a v2 pre-release, a v1 maintenance release
 * published between two v2 ones, then the newest stable v2.
 */
export const PKGX_RELEASES = [
  { tag_name: "v2.12.0-rc.1" },
  { tag_name: "v1.6.0" },
  { tag_name: "v2.11.0" },
  { tag_name: "v2.10.3" },
];

/** pkgx 2.10.3 where `binary` puts it. */
export function pkgxMachine(path: string): SystemSpec {
  return {
    platform: "darwin",
    bin: { pkgx: path },
    commands: [{ argv: ["pkgx", "--version"], stdout: "pkgx 2.10.3\n" }],
    http: [{ url: PKGX_RELEASES_URL, json: PKGX_RELEASES }],
  };
}

const PKGX_ROW = { id: "pkgx", name: "pkgx", current: "2.10.3", latest: "2.11.0" };

/** The newest stable release on the installed major line, upgraded by Homebrew. */
const PKGX: ProviderContractCase = {
  scenario: "homebrew",
  create: () => new PkgxProvider(),
  system: pkgxMachine("/opt/homebrew/bin/pkgx"),
  outdated: [{ ...PKGX_ROW, note: "via brew" }],
  update: { packageId: "pkgx", installs: [["brew", "upgrade", "--formula", "pkgx"]] },
  routes: delegationRoutes("pkgx", {
    ids: { brew: "pkgx" },
    manualMessage: PKGX_MANUAL_MESSAGE,
  }),
  updateAll: "collapsed",
};

/**
 * `curl | sh` is how pkgx usually lands: the row stays visible (not `manual`)
 * and the update names the installer, which upgrades pkgx too.
 */
const PKGX_FROM_INSTALLER: ProviderContractCase = {
  scenario: "official installer",
  create: () => new PkgxProvider(),
  system: pkgxMachine("/usr/local/bin/pkgx"),
  outdated: [{ ...PKGX_ROW, note: "manuel" }],
  update: {
    packageId: "pkgx",
    installs: [],
    outcome: { success: false, skipped: true, message: PKGX_MANUAL_MESSAGE },
  },
  updateAll: "skipped",
};

export const posixCases: readonly ProviderContractCase[] = [
  BREW,
  LINUXBREW,
  BREW_CASK,
  MAS,
  MACPORTS_AS_USER,
  MACPORTS_AS_ROOT,
  NIX,
  NIX_DETERMINATE,
  SPARKLE,
  FINK,
  PKGIN,
  PKGX,
  PKGX_FROM_INSTALLER,
];
