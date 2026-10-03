import { CabalProvider } from "../../../src/providers/lang-other/cabal.js";
import { FlutterProvider } from "../../../src/providers/lang-other/flutter.js";
import { HexProvider } from "../../../src/providers/lang-other/hex.js";
import { StackProvider } from "../../../src/providers/lang-other/stack.js";
import {
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * The lang-other tools gup updates as a whole: cabal-install, Stack, the Hex
 * archive and the Flutter SDK each report their own version, a registry
 * gives the latest one, and their own command upgrades them. The machines
 * and answers a knowledge test starts from are exported; the rest stays
 * private.
 */

// --- cabal-install --------------------------------------------------------------

/** Hackage's preferred versions of cabal-install, newest first. */
export function hackageRoute(json: unknown): HttpRoute {
  return { url: "https://hackage.haskell.org/package/cabal-install/preferred", json };
}

export const CABAL_UPDATE_ARGV = ["cabal", "update"];
export const CABAL_INSTALL_ARGV = [
  "cabal",
  "install",
  "cabal-install",
  "--overwrite-policy=always",
];

/** cabal 3.10.3.0 from GHCup; `cabal update` refreshes the index before a rebuild. */
export const CABAL_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { cabal: "C:\\ghcup\\bin\\cabal.exe" },
  commands: [
    {
      argv: ["cabal", "--version"],
      stdout: "cabal-install version 3.10.3.0\ncompiled using version 3.10.3.0 of the Cabal library",
    },
    {
      argv: CABAL_UPDATE_ARGV,
      stdout: "Downloading the latest package list from hackage.haskell.org",
    },
  ],
};

const CABAL: SelfUpdatingTool = {
  create: () => new CabalProvider(),
  system: CABAL_MACHINE,
  release: hackageRoute({ "normal-version": ["3.12.1.0", "3.10.3.0"] }),
  row: { id: "cabal-install", name: "cabal-install", current: "3.10.3.0", latest: "3.12.1.0" },
  upToDate: hackageRoute({ "normal-version": ["3.10.3.0"] }),
  installs: [CABAL_INSTALL_ARGV],
};

// --- Stack ----------------------------------------------------------------------

const STACK: SelfUpdatingTool = {
  create: () => new StackProvider(),
  system: {
    platform: "linux",
    bin: { stack: "/home/u/.local/bin/stack" },
    commands: [
      {
        argv: ["stack", "--version"],
        stdout: "Version 2.15.5, Git revision 1c8b0d5f0bb8fb2c5aa22f05ee2c4cb2ffd41bdf x86_64 hpack-0.36.0",
      },
    ],
  },
  release: githubLatest("commercialhaskell/stack", "v2.15.7"),
  row: { id: "stack", name: "Stack", current: "2.15.5", latest: "2.15.7" },
  upToDate: githubLatest("commercialhaskell/stack", "v2.15.5"),
  installs: [["stack", "upgrade"]],
};

// --- Hex ------------------------------------------------------------------------

const HEX_PROBE_ARGV = ["mix", "hex", "--version"];

/** hex.pm's package endpoint for the Hex archive itself. */
export function hexPmRoute(json: unknown): HttpRoute {
  return { url: "https://hex.pm/api/packages/hex", json };
}

/** Elixir from Homebrew with the Hex archive answering `probe`. */
export function hexMachine(probe: Omit<CommandScript, "argv">): SystemSpec {
  return {
    platform: "darwin",
    bin: { mix: "/opt/homebrew/bin/mix" },
    commands: [{ argv: HEX_PROBE_ARGV, ...probe }],
  };
}

export const HEX_BANNER = "Hex  v2.0.0 (Elixir 1.16.2) (OTP 26.2.2)";

/** The stable release wins over a newer release candidate. */
const HEX: SelfUpdatingTool = {
  create: () => new HexProvider(),
  system: hexMachine({ stdout: HEX_BANNER }),
  release: hexPmRoute({ latest_stable_version: "2.0.6", latest_version: "2.1.0-rc.1" }),
  row: { id: "hex", name: "Hex", current: "2.0.0", latest: "2.0.6" },
  upToDate: hexPmRoute({ latest_stable_version: "2.0.0", latest_version: "2.1.0-rc.1" }),
  installs: [["mix", "local.hex", "--force"]],
};

// --- Flutter SDK ----------------------------------------------------------------

const FLUTTER_RELEASES_URL =
  "https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json";

/** The release index: each channel's current hash, and the releases the hashes name. */
export function flutterReleases(currentRelease: Record<string, string>): HttpRoute {
  return {
    url: FLUTTER_RELEASES_URL,
    json: {
      current_release: currentRelease,
      releases: [
        { hash: "s3243", channel: "stable", version: "3.24.3" },
        { hash: "b3250", channel: "beta", version: "3.25.0-0.1.pre" },
        { hash: "s3222", channel: "stable", version: "3.22.2" },
      ],
    },
  };
}

/** The SDK printing `machine` for `flutter --version --machine`. */
export function flutterMachine(machine: Record<string, string>): SystemSpec {
  return {
    platform: "win32",
    bin: { flutter: "C:\\src\\flutter\\bin\\flutter.bat" },
    commands: [{ argv: ["flutter", "--version", "--machine"], stdout: JSON.stringify(machine) }],
  };
}

const FLUTTER: SelfUpdatingTool = {
  create: () => new FlutterProvider(),
  system: flutterMachine({
    frameworkVersion: "3.22.2",
    channel: "stable",
    repositoryUrl: "https://github.com/flutter/flutter.git",
    dartSdkVersion: "3.4.3",
  }),
  release: flutterReleases({ stable: "s3243", beta: "b3250" }),
  row: {
    id: "flutter",
    name: "Flutter",
    current: "3.22.2",
    latest: "3.24.3",
    note: "channel stable",
  },
  upToDate: flutterReleases({ stable: "s3222", beta: "b3250" }),
  installs: [["flutter", "upgrade"]],
};

export const selfUpdatingCases: readonly ProviderContractCase[] = [
  CABAL,
  STACK,
  HEX,
  FLUTTER,
].flatMap(selfUpdatingToolCases);
