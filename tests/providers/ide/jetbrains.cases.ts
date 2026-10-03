import { posix, win32 } from "node:path";
import { JetBrainsProvider } from "../../../src/providers/ide/jetbrains.js";
import { type Installer, upgradeArgv } from "../../support/contract/installers.js";
import type { ProviderContractCase, UpdateRoute } from "../../support/contract/types.js";
import { MAC_HOME, WIN_HOME } from "../../support/system/os-identity.js";
import type { FsNode, HttpRoute, SimPlatform, SystemSpec } from "../../support/system/types.js";

/**
 * JetBrains IDEs, found by walking the install roots of each channel for a
 * `product-info.json`, versioned against the JetBrains release feed, and
 * upgraded through the channel that owns the install: scoop, winget or a
 * Homebrew cask take the upgrade; Toolbox and hand installs are left to the
 * user. The layouts and manifests a knowledge test starts from are exported.
 */

const LOCAL = `${WIN_HOME}\\AppData\\Local`;

/** Where each channel puts an IDE, as the provider's candidate roots list them. */
export const WIN_ROOTS = {
  toolbox: `${LOCAL}\\JetBrains\\Toolbox\\apps`,
  programFiles: "C:\\Program Files\\JetBrains",
  programFilesX86: "C:\\Program Files (x86)\\JetBrains",
  programs: `${LOCAL}\\Programs`,
  scoop: `${WIN_HOME}\\scoop\\apps`,
} as const;

export const MAC_ROOTS = {
  applications: "/Applications",
  userApplications: `${MAC_HOME}/Applications`,
  toolbox: `${MAC_HOME}/Library/Application Support/JetBrains/Toolbox/apps`,
} as const;

/** The fields the provider reads off `product-info.json`. */
export interface ProductInfo {
  readonly name: string;
  readonly version: string;
  readonly buildNumber: string;
  readonly productCode: string;
}

export const WEBSTORM_2024_1: ProductInfo = {
  name: "WebStorm",
  version: "2024.1.0",
  buildNumber: "241.14494.229",
  productCode: "WS",
};

/** `product-info.json` in `dir`, holding `content` (a manifest, or raw text). */
export function productInfoAt(dir: string, content: ProductInfo | string): [string, FsNode] {
  const join = dir.includes("\\") ? win32.join : posix.join;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return [join(dir, "product-info.json"), { kind: "file", content: text }];
}

/** `GET …/products/releases?code=<code>&latest=true&type=release` → the latest release. */
export function jetbrainsRelease(productCode: string, build: string, version: string): HttpRoute {
  const url =
    `https://data.services.jetbrains.com/products/releases?code=${productCode}` +
    "&latest=true&type=release";
  return { url, json: { [productCode]: [{ build, version, type: "release" }] } };
}

export const WEBSTORM_2024_2 = jetbrainsRelease("WS", "242.20224.300", "2024.2.0");

/** The IDE directory each layout holds WebStorm 2024.1 in. */
export const WEBSTORM_DIRS = {
  scoop: `${WIN_ROOTS.scoop}\\webstorm\\current\\IDE`,
  winget: `${WIN_ROOTS.programs}\\WebStorm 2024.1`,
  toolbox: `${WIN_ROOTS.toolbox}\\WebStorm\\ch-0\\241.14494.229`,
  manual: `${WIN_ROOTS.programFiles}\\WebStorm 2024.1`,
} as const;

export interface IdeMachine {
  readonly platform: SimPlatform;
  /** Directories holding a `product-info.json`, with what it says. */
  readonly installs: readonly (readonly [string, ProductInfo | string])[];
  readonly http?: readonly HttpRoute[];
  readonly fs?: Readonly<Record<string, FsNode>>;
}

/** A machine with IDEs installed in `installs`, the release feed answering `http`. */
export function ideMachine(machine: IdeMachine): SystemSpec {
  const manifests = machine.installs.map(([dir, content]) => productInfoAt(dir, content));
  return {
    platform: machine.platform,
    fs: { ...Object.fromEntries(manifests), ...machine.fs },
    http: machine.http ?? [WEBSTORM_2024_2],
  };
}

/** WebStorm 2024.1 installed in one Windows layout. */
export function webstormIn(layout: keyof typeof WEBSTORM_DIRS): SystemSpec {
  return ideMachine({ platform: "win32", installs: [[WEBSTORM_DIRS[layout], WEBSTORM_2024_1]] });
}

// --- macOS ----------------------------------------------------------------------

export const MAC_BUNDLE = `${MAC_ROOTS.applications}/WebStorm.app`;
export const CASKROOM_BUNDLE = "/opt/homebrew/Caskroom/webstorm/2024.1.0/WebStorm.app";

/** The siblings of Contents/Resources in `bundle`, and an unrelated bundle the walk must skip. */
export function bundleNoise(bundle: string): Readonly<Record<string, FsNode>> {
  return {
    [`${bundle}/Contents/MacOS`]: { kind: "dir" },
    [`${bundle}/Contents/Frameworks`]: { kind: "dir" },
    [`${MAC_ROOTS.applications}/Xcode.app/Contents/Developer`]: { kind: "dir" },
  };
}

/** WebStorm.app in /Applications, a link into the Homebrew Caskroom (`target` changes that). */
export function macBundleMachine(target: string = CASKROOM_BUNDLE): SystemSpec {
  const isLinked = target !== MAC_BUNDLE;
  return ideMachine({
    platform: "darwin",
    installs: [[`${target}/Contents/Resources`, WEBSTORM_2024_1]],
    fs: {
      ...bundleNoise(target),
      ...(isLinked && { [MAC_BUNDLE]: { kind: "symlink", target } }),
    },
  });
}

// --- cases ----------------------------------------------------------------------

export const TOOLBOX_SKIP = "Géré par Toolbox — ouvrir Toolbox pour appliquer.";
export const WEBSTORM_DOWNLOAD =
  "Installation manuelle — https://www.jetbrains.com/webstorm/download/";

const WEBSTORM_IDS = { winget: "JetBrains.WebStorm", scoop: "webstorm", brewCask: "webstorm" };

/** The upgrade `installer` runs for WebStorm. */
function upgradeVia(installer: Installer): string[] {
  const argv = upgradeArgv(installer, WEBSTORM_IDS);
  if (!argv) throw new Error(`no ${installer} id for WebStorm`);
  return argv;
}

const row = { id: "WS", name: "WebStorm", current: "2024.1.0", latest: "2024.2.0" };

const skippedWith = (message: string) => ({ success: false, skipped: true, message });

/** The update on every other Windows layout: winget upgrades, Toolbox and hand installs skip. */
const WEBSTORM_ROUTES: readonly UpdateRoute[] = [
  { via: "winget", system: webstormIn("winget"), installs: [upgradeVia("winget")] },
  {
    via: "toolbox",
    system: webstormIn("toolbox"),
    installs: [],
    outcome: skippedWith(TOOLBOX_SKIP),
  },
  {
    via: "manual",
    system: webstormIn("manual"),
    installs: [],
    outcome: skippedWith(WEBSTORM_DOWNLOAD),
  },
];

const SCOOP: ProviderContractCase = {
  scenario: "scoop",
  create: () => new JetBrainsProvider(),
  system: webstormIn("scoop"),
  outdated: [{ ...row, note: "via scoop" }],
  update: { packageId: "WS", installs: [upgradeVia("scoop")] },
  routes: WEBSTORM_ROUTES,
  updateAll: "per-package",
};

/** Toolbox owns its installs: listed for information, never upgraded behind its back. */
const TOOLBOX: ProviderContractCase = {
  scenario: "toolbox",
  create: () => new JetBrainsProvider(),
  system: webstormIn("toolbox"),
  outdated: [{ ...row, note: "via Toolbox", manual: true }],
  update: { packageId: "WS", installs: [], outcome: skippedWith(TOOLBOX_SKIP) },
  updateAll: "skipped",
};

const MANUAL: ProviderContractCase = {
  scenario: "manual install",
  create: () => new JetBrainsProvider(),
  system: webstormIn("manual"),
  outdated: [{ ...row, note: "manuel", manual: true }],
  update: { packageId: "WS", installs: [], outcome: skippedWith(WEBSTORM_DOWNLOAD) },
  updateAll: "skipped",
};

/** The bundle resolves into the Caskroom: Homebrew owns it and takes the cask upgrade. */
const HOMEBREW_CASK: ProviderContractCase = {
  scenario: "homebrew cask",
  create: () => new JetBrainsProvider(),
  system: macBundleMachine(),
  outdated: [{ ...row, note: "via brew" }],
  update: { packageId: "WS", installs: [upgradeVia("brew")] },
  updateAll: "per-package",
};

/** A bundle dropped into /Applications by hand: nobody to delegate to. */
const MAC_BY_HAND: ProviderContractCase = {
  scenario: "bundle dropped by hand",
  create: () => new JetBrainsProvider(),
  system: macBundleMachine(MAC_BUNDLE),
  outdated: [{ ...row, note: "manuel", manual: true }],
  update: { packageId: "WS", installs: [], outcome: skippedWith(WEBSTORM_DOWNLOAD) },
  updateAll: "skipped",
};

export const jetbrainsCases: readonly ProviderContractCase[] = [
  SCOOP,
  TOOLBOX,
  MANUAL,
  HOMEBREW_CASK,
  MAC_BY_HAND,
];
