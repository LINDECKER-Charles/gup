import type { OutdatedPackage, Provider } from "../../../src/core/types.js";
import { WslAptProvider } from "../../../src/providers/wsl/wsl-apt.js";
import { WslBrewProvider } from "../../../src/providers/wsl/wsl-brew.js";
import { WslDnfProvider } from "../../../src/providers/wsl/wsl-dnf.js";
import { WslFlatpakProvider } from "../../../src/providers/wsl/wsl-flatpak.js";
import { WslNixProvider } from "../../../src/providers/wsl/wsl-nix.js";
import { WslPacmanProvider } from "../../../src/providers/wsl/wsl-pacman.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import type { CommandAnswer, CommandScript, SystemSpec } from "../../support/system/types.js";
import { asUtf16, wslHost } from "./wsl.cases.js";

/**
 * Package managers inside WSL distributions. Each lists the distributions,
 * asks each one whether it has its manager, counts what is upgradable there,
 * and offers one row per distribution (its upgrade is one atomic command).
 * Every command runs through `wsl -d <distro> [-u root] -e bash -lc <script>`;
 * the scripts are pinned verbatim, as they reach the distribution's shell.
 */

export const LIST_DISTROS = ["wsl", "-l", "-q"];

/** `script` run in `distro` as the default user. */
export function inDistro(distro: string, script: string): string[] {
  return ["wsl", "-d", distro, "-e", "bash", "-lc", script];
}

/** `script` run in `distro` as root, so no sudo prompt can stall it. */
export function asRootIn(distro: string, script: string): string[] {
  return ["wsl", "-d", distro, "-u", "root", "-e", "bash", "-lc", script];
}

/** One distribution: its name, and what it answers. */
export interface Distro {
  readonly name: string;
  readonly commands: readonly CommandScript[];
}

/** What `wsl -l -q` prints for `names`: one per line, in UTF-16. */
export function distroListing(names: readonly string[]): string {
  return asUtf16(names.map((name) => `${name}\r\n`).join(""));
}

/** WSL listing `distros` (and `internal` ones gup must never start). */
export function distrosMachine(
  distros: readonly Distro[],
  internal: readonly string[] = [],
): SystemSpec {
  const names = [...distros.map((distro) => distro.name), ...internal];
  return wslHost([
    { argv: LIST_DISTROS, stdout: distroListing(names) },
    ...distros.flatMap((distro) => distro.commands),
  ]);
}

/** The probe `distroHasBinary` runs: `command -v`, then the fallback paths. */
export function binaryProbe(
  distro: string,
  binary: string,
  extraPaths: readonly string[] = [],
): string[] {
  const tests = [`command -v ${binary} >/dev/null 2>&1`, ...extraPaths.map((p) => `[ -x "${p}" ]`)];
  return inDistro(distro, tests.join(" || "));
}

const absent: CommandAnswer = { exitCode: 1 };

/**
 * A manager whose scan counts upgradable packages: how it is found, how the
 * count is asked, and how a distribution is upgraded.
 */
export interface CountingManager {
  readonly create: () => Provider;
  /** The suffix of its rows' names: `Ubuntu (apt)`. */
  readonly label: string;
  readonly probe: (distro: string) => string[];
  readonly count: (distro: string) => string[];
  readonly upgrade: (distro: string) => string[];
}

/** `name` with the manager answering its count with `count`, or without the manager. */
export function managedDistro(
  manager: CountingManager,
  name: string,
  count?: CommandAnswer,
): Distro {
  if (!count) return { name, commands: [{ argv: manager.probe(name), ...absent }] };
  return {
    name,
    commands: [{ argv: manager.probe(name) }, { argv: manager.count(name), ...count }],
  };
}

const APT_COUNT =
  "DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 && " +
  "apt list --upgradable 2>/dev/null | awk 'NR>1 && /\\//{c++}END{print c+0}'";
const APT_UPGRADE =
  "DEBIAN_FRONTEND=noninteractive apt-get update -qq && " +
  "DEBIAN_FRONTEND=noninteractive apt-get -y upgrade";

export const APT: CountingManager = {
  create: () => new WslAptProvider(),
  label: "apt",
  probe: (distro) => binaryProbe(distro, "apt-get"),
  count: (distro) => asRootIn(distro, APT_COUNT),
  upgrade: (distro) => asRootIn(distro, APT_UPGRADE),
};

const BREW_PATHS = ["$HOME/.linuxbrew/bin/brew", "/home/linuxbrew/.linuxbrew/bin/brew"];
/** brew's `shellenv`, sourced first: non-interactive shells rarely load it. */
const BREW_ENV =
  'if [ -x /home/linuxbrew/.linuxbrew/bin/brew ]; then eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"; ' +
  'elif [ -x "$HOME/.linuxbrew/bin/brew" ]; then eval "$($HOME/.linuxbrew/bin/brew shellenv)"; fi';

/** Linuxbrew belongs to the user: never root. */
export const BREW: CountingManager = {
  create: () => new WslBrewProvider(),
  label: "brew",
  probe: (distro) => binaryProbe(distro, "brew", BREW_PATHS),
  count: (distro) => inDistro(distro, `${BREW_ENV} && brew outdated --quiet 2>/dev/null | wc -l`),
  upgrade: (distro) => inDistro(distro, `${BREW_ENV} && brew update && brew upgrade`),
};

/** dnf's count is its exit code: 100 when updates exist, one line per package. */
export const DNF: CountingManager = {
  create: () => new WslDnfProvider(),
  label: "dnf",
  probe: (distro) => binaryProbe(distro, "dnf"),
  count: (distro) => asRootIn(distro, "dnf -q check-update 2>/dev/null"),
  upgrade: (distro) => asRootIn(distro, "dnf -y upgrade"),
};

const FLATPAK_COUNT =
  "flatpak remote-ls --updates --columns=application 2>/dev/null | awk 'NF{c++}END{print c+0}'";

export const FLATPAK: CountingManager = {
  create: () => new WslFlatpakProvider(),
  label: "flatpak",
  probe: (distro) => binaryProbe(distro, "flatpak"),
  count: (distro) => inDistro(distro, FLATPAK_COUNT),
  upgrade: (distro) => inDistro(distro, "flatpak update --noninteractive --assumeyes"),
};

/** pacman's count comes from pacman-contrib's `checkupdates`, probed separately. */
export const PACMAN: CountingManager = {
  create: () => new WslPacmanProvider(),
  label: "pacman",
  probe: (distro) => binaryProbe(distro, "pacman"),
  count: (distro) => inDistro(distro, "checkupdates 2>/dev/null"),
  upgrade: (distro) => asRootIn(distro, "pacman -Syu --noconfirm"),
};

/** An Arch distribution with pacman, whose `checkupdates` is there (or not) and answers `count`. */
export function archDistro(name: string, count?: CommandAnswer): Distro {
  const checkupdates = binaryProbe(name, "checkupdates");
  const contrib: CommandScript[] = count
    ? [{ argv: checkupdates }, { argv: PACMAN.count(name), ...count }]
    : [{ argv: checkupdates, ...absent }];
  return { name, commands: [{ argv: PACMAN.probe(name) }, ...contrib] };
}

const NIX_PATHS = ["$HOME/.nix-profile/bin/nix-env", "/nix/var/nix/profiles/default/bin/nix-env"];
const NIX_ENV =
  "if [ -f /etc/profile.d/nix.sh ]; then . /etc/profile.d/nix.sh; " +
  'elif [ -f "$HOME/.nix-profile/etc/profile.d/nix.sh" ]; then . "$HOME/.nix-profile/etc/profile.d/nix.sh"; fi';

export function nixProbe(distro: string): string[] {
  return binaryProbe(distro, "nix-env", NIX_PATHS);
}

export function nixUpgrade(distro: string): string[] {
  return inDistro(distro, `${NIX_ENV} && nix-channel --update && nix-env -u '*'`);
}

function distroRow(distro: string, label: string, latest: string): OutdatedPackage {
  return { id: distro, name: `${distro} (${label})`, current: "?", latest };
}

interface DistroScenario {
  readonly create: () => Provider;
  readonly scenario?: string;
  readonly machine: SystemSpec;
  readonly rows: readonly OutdatedPackage[];
  readonly upgrade: string[];
}

/** One distribution upgraded per row, in row order. */
function distroCase(entry: DistroScenario): ProviderContractCase {
  const [first] = entry.rows;
  if (!first) throw new Error("a distribution scenario lists at least one row");
  return {
    ...(entry.scenario && { scenario: entry.scenario }),
    create: entry.create,
    system: entry.machine,
    outdated: entry.rows,
    update: { packageId: first.id, installs: [entry.upgrade] },
    updateAll: "per-package",
  };
}

const APT_CASE = distroCase({
  create: APT.create,
  // Docker Desktop's distributions are never started: they ship no manager.
  machine: distrosMachine(
    [managedDistro(APT, "Ubuntu", { stdout: "3\n" }), managedDistro(APT, "Alpine")],
    ["docker-desktop", "docker-desktop-data"],
  ),
  rows: [distroRow("Ubuntu", "apt", "3 pkg")],
  upgrade: APT.upgrade("Ubuntu"),
});

const BREW_CASE = distroCase({
  create: BREW.create,
  machine: distrosMachine([
    managedDistro(BREW, "Ubuntu"),
    managedDistro(BREW, "Debian", { stdout: "4\n" }),
  ]),
  rows: [distroRow("Debian", "brew", "4 pkg")],
  upgrade: BREW.upgrade("Debian"),
});

const DNF_CASE = distroCase({
  create: DNF.create,
  machine: distrosMachine([
    managedDistro(DNF, "Fedora", {
      stdout:
        "Last metadata expiration check: 0:01:23 ago\n" +
        "bash.x86_64 5.2.21-1.fc40 updates\n" +
        "kernel.x86_64 6.9.0-1.fc40 updates\n",
      exitCode: 100,
    }),
  ]),
  rows: [distroRow("Fedora", "dnf", "2 pkg")],
  upgrade: DNF.upgrade("Fedora"),
});

const FLATPAK_CASE = distroCase({
  create: FLATPAK.create,
  machine: distrosMachine([managedDistro(FLATPAK, "Ubuntu", { stdout: "5\n" })]),
  rows: [distroRow("Ubuntu", "flatpak", "5 pkg")],
  upgrade: FLATPAK.upgrade("Ubuntu"),
});

/** Nix cannot count without evaluating channels: one refresh row per distribution with nix. */
const NIX_CASE = distroCase({
  create: () => new WslNixProvider(),
  machine: distrosMachine([
    { name: "Ubuntu", commands: [{ argv: nixProbe("Ubuntu") }] },
    { name: "Debian", commands: [{ argv: nixProbe("Debian"), ...absent }] },
  ]),
  rows: [{ ...distroRow("Ubuntu", "nix", "refresh"), note: "nix-channel --update && nix-env -u" }],
  upgrade: nixUpgrade("Ubuntu"),
});

const PACMAN_CASE = distroCase({
  create: PACMAN.create,
  machine: distrosMachine([
    archDistro("Arch", { stdout: "bash 5.2-1 -> 5.3-1\nzsh 5.9-1 -> 5.9-2\n" }),
  ]),
  rows: [distroRow("Arch", "pacman", "2 pkg")],
  upgrade: PACMAN.upgrade("Arch"),
});

/** Without pacman-contrib nothing can be counted: a refresh row says how to check. */
const PACMAN_WITHOUT_CONTRIB = distroCase({
  create: PACMAN.create,
  scenario: "without pacman-contrib",
  machine: distrosMachine([archDistro("Arch")]),
  rows: [
    {
      ...distroRow("Arch", "pacman", "refresh"),
      note: "pacman-contrib absent — déclencher pacman -Syu pour vérifier",
    },
  ],
  upgrade: PACMAN.upgrade("Arch"),
});

export const distroCases: readonly ProviderContractCase[] = [
  APT_CASE,
  BREW_CASE,
  DNF_CASE,
  FLATPAK_CASE,
  NIX_CASE,
  PACMAN_CASE,
  PACMAN_WITHOUT_CONTRIB,
];
