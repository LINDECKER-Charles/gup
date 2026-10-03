import type { UpdateOutcome } from "../../../src/core/types.js";
import { WIN_HOME } from "../system/os-identity.js";
import type { CommandScript, SystemSpec } from "../system/types.js";
import type { UpdateRoute } from "./types.js";

/**
 * Machines on which a given installer owns a binary, and the upgrade each
 * installer is expected to run. Most providers that wrap a single binary
 * (terraform, kubectl, gh…) do not update it themselves: gup locates the
 * binary on PATH, recognises the installer from its directory and hands the
 * upgrade over. These helpers build that situation once, so a case states
 * only what is specific to its provider: the package id it gives each
 * installer.
 *
 * Pure data, no vitest import: the fixture recorder loads the cases.
 */

export type Installer = "scoop" | "winget" | "choco" | "brew" | "apt" | "dnf" | "manual";

/** The ids a delegating provider hands each installer (its `packageIds`). */
export interface DelegatedIds {
  readonly scoop?: string;
  readonly choco?: string;
  readonly winget?: string;
  readonly brew?: string;
  readonly brewCask?: string;
  readonly apt?: string;
  readonly dnf?: string;
}

/** Where each installer puts a binary on PATH, as install-source recognises it. */
const BINARY_PATH: Readonly<Record<Installer, (binary: string) => string>> = {
  scoop: (binary) => `${WIN_HOME}\\scoop\\shims\\${binary}.exe`,
  winget: (binary) => `${WIN_HOME}\\AppData\\Local\\Microsoft\\WinGet\\Links\\${binary}.exe`,
  choco: (binary) => `C:\\ProgramData\\chocolatey\\bin\\${binary}.exe`,
  brew: (binary) => `/opt/homebrew/bin/${binary}`,
  apt: (binary) => `/usr/bin/${binary}`,
  dnf: (binary) => `/usr/bin/${binary}`,
  manual: (binary) => `C:\\Tools\\${binary}.exe`,
};

const PLATFORM: Readonly<Record<Installer, SystemSpec["platform"]>> = {
  scoop: "win32",
  winget: "win32",
  choco: "win32",
  brew: "darwin",
  apt: "linux",
  dnf: "linux",
  manual: "win32",
};

/** Distro packages own files in shared prefixes: only their database can tell. */
function ownershipProbe(installer: Installer, path: string): Partial<SystemSpec> {
  if (installer === "apt") {
    const answer: CommandScript = { argv: ["dpkg", "-S", path], stdout: `tool: ${path}` };
    return { bin: { dpkg: "/usr/bin/dpkg" }, commands: [answer] };
  }
  if (installer === "dnf") {
    const answer: CommandScript = { argv: ["rpm", "-qf", path], stdout: "tool-1.0-1.x86_64" };
    return { bin: { rpm: "/usr/bin/rpm" }, commands: [answer] };
  }
  return {};
}

/** The binary path `installer` gives `binary` on its machine. */
export function binaryPathVia(installer: Installer, binary: string): string {
  return BINARY_PATH[installer](binary);
}

/**
 * A machine where `installer` owns `binary`, with `extra` merged in: `bin`,
 * `fs` and `env` are merged, `commands` and `http` concatenated.
 */
export function installedVia(
  installer: Installer,
  binary: string,
  extra: Omit<SystemSpec, "platform"> = {},
): SystemSpec {
  const path = binaryPathVia(installer, binary);
  const probe = ownershipProbe(installer, path);
  return {
    ...extra,
    platform: PLATFORM[installer],
    bin: { ...probe.bin, [binary]: path, ...extra.bin },
    commands: [...(probe.commands ?? []), ...(extra.commands ?? [])],
  };
}

const WINGET_FLAGS = ["--silent", "--accept-package-agreements", "--accept-source-agreements"];

/** The upgrade each installer runs, given the ids it was handed; null without its id. */
const UPGRADE_ARGV: Readonly<Record<Installer, (ids: DelegatedIds) => string[] | null>> = {
  scoop: ({ scoop }) => (scoop ? ["scoop", "update", scoop] : null),
  choco: ({ choco }) => (choco ? ["choco", "upgrade", choco, "-y"] : null),
  winget: ({ winget }) => (winget ? ["winget", "upgrade", "--id", winget, ...WINGET_FLAGS] : null),
  // A cask and a formula of the same name are different installs: the cask wins.
  brew: ({ brew, brewCask }) => {
    if (brewCask) return ["brew", "upgrade", "--cask", brewCask];
    return brew ? ["brew", "upgrade", "--formula", brew] : null;
  },
  apt: ({ apt }) => (apt ? ["sudo", "apt-get", "install", "--only-upgrade", "-y", apt] : null),
  dnf: ({ dnf }) => (dnf ? ["sudo", "dnf", "upgrade", "-y", dnf] : null),
  manual: () => null,
};

/** The upgrade argv `installer` runs for the ids it was given; null without an id. */
export function upgradeArgv(installer: Installer, ids: DelegatedIds): string[] | null {
  return UPGRADE_ARGV[installer](ids);
}

/** Every delegating provider is routed through these; apt and dnf when it maps them. */
const ALWAYS_ROUTED: readonly Installer[] = ["scoop", "winget", "choco", "brew", "manual"];

interface RouteTarget {
  readonly binary: string;
  readonly delegation: Delegation;
  readonly extra: Omit<SystemSpec, "platform">;
}

function routeVia(installer: Installer, target: RouteTarget): UpdateRoute {
  const { binary, delegation, extra } = target;
  const argv = upgradeArgv(installer, delegation.ids);
  const skipped: Partial<UpdateOutcome> = {
    success: false,
    skipped: true,
    message: delegation.manualMessage,
  };
  return {
    via: installer,
    system: installedVia(installer, binary, extra),
    installs: argv ? [argv] : [],
    ...(!argv && { outcome: skipped }),
  };
}

export interface Delegation {
  readonly ids: DelegatedIds;
  /** The message of the skipped outcome when no installer can take the upgrade. */
  readonly manualMessage: string;
}

/**
 * One route per installer for a provider that delegates the upgrade of
 * `binary`: the upgrade argv where it maps an id, its manual message (a
 * skipped outcome) where it does not — including on a hand-installed binary.
 * `extra` goes onto every route's machine, for a provider whose update reads
 * more than the binary's location (a release index, a version probe).
 */
export function delegationRoutes(
  binary: string,
  delegation: Delegation,
  extra: Omit<SystemSpec, "platform"> = {},
): UpdateRoute[] {
  const distro = (["apt", "dnf"] as const).filter((installer) => delegation.ids[installer]);
  const target = { binary, delegation, extra };
  return [...ALWAYS_ROUTED, ...distro].map((installer) => routeVia(installer, target));
}
