import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix as posixPath } from "node:path";

import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { run, runInherit, commandExists, whichFirst } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Nix as the *native* package manager on macOS and Linux.
 *
 * Gated on `process.platform !== "win32"` on purpose: on Windows, Nix only ever
 * lives inside a WSL distro, and the `wsl-nix` provider already enumerates
 * those. Without the gate the same install would be reported twice — once
 * through `wsl.exe`, once through whatever `nix` shim leaked onto the Windows
 * PATH.
 *
 * Scope is deliberately narrow — two rows, nothing else:
 *
 *  1. `nix` itself, compared against the newest version of the track the
 *     install actually follows (upstream tags, or Determinate's own releases).
 *  2. the current user's profile, as a refresh-style row.
 *
 * What this provider does NOT cover, and why:
 *  - NixOS system generations. Those move with `nixos-rebuild`, which rebuilds
 *    the whole machine; that is a system administration action, not a package
 *    update, and it has no "outdated" list to show first.
 *  - home-manager generations, project flake inputs (`nix flake update`) and
 *    dev shells. All three are per-checkout state that belongs to the repo, not
 *    to the machine, so bumping them from a global updater would rewrite lock
 *    files the user never asked us to touch.
 *  - `nix-channel --update`. Channels are the input side of the classic
 *    profile; `nix-env --upgrade` is what actually applies them, and that is
 *    already the fallback path of the profile row below.
 */
export class NixProvider implements Provider {
  readonly id = "nix";
  readonly displayName = "Nix";
  readonly installHint = pickInstallHint({
    darwin: "https://nixos.org/download",
    linux: "https://nixos.org/download",
    fallback: "Sous Windows, Nix s'installe dans WSL — voir le provider wsl-nix.",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform === "win32") return false;
    try {
      return await commandExists("nix");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      const rows: OutdatedPackage[] = [];
      const binary = await scanBinary();
      if (binary) rows.push(binary);
      if (hasUserProfile()) rows.push(profileRow());
      return rows;
    } catch {
      return [];
    }
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    try {
      if (packageId === PROFILE_ID) return await upgradeProfile();
      if (packageId === BINARY_ID) return await upgradeBinary();
      return {
        id: packageId,
        success: false,
        message: `Cible inconnue pour nix : ${packageId}`,
      };
    } catch {
      return {
        id: packageId,
        success: false,
        message: "La commande nix n'a pas pu être lancée.",
      };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    // Sequential: both commands mutate the same store and profile database,
    // and running them concurrently just makes them queue on the daemon lock
    // with interleaved output.
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

const BINARY_ID = "nix";
const PROFILE_ID = "profile";
const NIX_REPO = "NixOS/nix";
const DETERMINATE_REPO = "DeterminateSystems/nix-src";

/**
 * `nix profile` is gated behind the `nix-command` experimental feature (every
 * subcommand inherits it from `Command::experimentalFeature()` in libutil), and
 * upgrading re-evaluates the flakes elements were installed from, which needs
 * `flakes`. Both names go in a single argv entry — the setting is a list and
 * the flag takes exactly one value.
 *
 * `nix upgrade-nix` deliberately does NOT get this flag: its
 * `experimentalFeature()` override returns `std::nullopt` ("this command is
 * stable before the others", src/nix/upgrade-nix.cc), and passing an unknown
 * flag to an older Nix would turn a working upgrade into a usage error.
 */
const EXPERIMENTAL_FEATURES = "nix-command flakes";

/**
 * Which upgrade track this install follows. The distinction is not cosmetic:
 * each one is a different "latest" number *and* a different upgrade command,
 * and mixing them up produces a row the user can never clear.
 */
type NixFlavour = "determinate" | "nixos-system" | "standalone";

const FLAVOUR_NOTES: Record<NixFlavour, string> = {
  determinate: "Determinate Nix — mise à jour par sudo determinate-nixd upgrade",
  "nixos-system": "profil système NixOS — mise à jour par nixos-rebuild",
  standalone: "nix upgrade-nix — install mono-utilisateur uniquement",
};

/**
 * Upstream documents both refusals, so running `nix upgrade-nix` in these two
 * cases is a guaranteed failure: `getProfileDir()` throws "Nix on NixOS must be
 * upgraded via 'nixos-rebuild'", and Determinate ships its own daemon-driven
 * updater. We surface them as skips carrying the real command instead of
 * spending a minute proving upstream right.
 */
const FLAVOUR_SKIPS: Record<Exclude<NixFlavour, "standalone">, string> = {
  determinate:
    "Determinate Nix se met à jour avec sa propre commande : sudo determinate-nixd upgrade",
  "nixos-system":
    "Nix fait partie de la clôture système NixOS : mettre à jour avec nixos-rebuild switch",
};

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

async function scanBinary(): Promise<OutdatedPackage | null> {
  const { stdout, failed } = await run("nix", ["--version"]);
  if (failed) return null;

  const flavour = await detectFlavour(stdout);
  const current = currentVersion(flavour, stdout);
  if (!current) return null;

  const latest = await fetchLatestVersion(flavour);
  if (!latest || compareNumericVersions(current, latest) >= 0) return null;

  return {
    id: BINARY_ID,
    name: "nix",
    current,
    latest,
    note: FLAVOUR_NOTES[flavour],
  };
}

/**
 * Determinate reports two versions and only its own moves when the user runs
 * the documented upgrade, so that is the one to compare. Reading the upstream
 * base version instead would pin a Determinate install as permanently outdated
 * every time NixOS/nix tags a release Determinate has not rebased onto yet.
 */
function currentVersion(flavour: NixFlavour, versionOutput: string): string | null {
  return flavour === "determinate"
    ? parseDeterminateVersion(versionOutput)
    : parseNixVersion(versionOutput);
}

async function fetchLatestVersion(flavour: NixFlavour): Promise<string | null> {
  return flavour === "determinate"
    ? fetchGitHubReleaseLatest(DETERMINATE_REPO)
    : fetchLatestNixTag();
}

/**
 * Determinate first (its banner is unambiguous), then the NixOS check, which
 * mirrors upstream's own: `nix upgrade-nix` resolves `nix-env` through PATH and
 * refuses when it sits under `/run/current-system`, i.e. when Nix comes from the
 * NixOS system closure.
 */
async function detectFlavour(versionOutput: string): Promise<NixFlavour> {
  if (isDeterminate(versionOutput)) return "determinate";
  const nixEnv = await whichFirst("nix-env");
  if (nixEnv !== null && nixEnv.startsWith("/run/current-system")) {
    return "nixos-system";
  }
  return "standalone";
}

/** The Determinate build prints "nix (Determinate Nix 3.21.9) 2.35.1". */
function isDeterminate(versionOutput: string): boolean {
  return /\(determinate nix\b/i.test(versionOutput);
}

/**
 * There is no cheap "what would change" answer for a Nix profile: `nix profile
 * upgrade` finds out by fetching and re-evaluating every flake the profile was
 * built from, which is the same work as performing the upgrade. So we surface
 * the profile as one refresh action instead of faking a per-package diff.
 */
function profileRow(): OutdatedPackage {
  return {
    id: PROFILE_ID,
    name: "profil utilisateur",
    current: "?",
    latest: "refresh",
    note: "nix profile upgrade --all — réévalue chaque flake du profil",
  };
}

/**
 * `nix` being on PATH does not imply the current user owns a profile: a daemon
 * install puts the binary in the system profile for everybody, and someone who
 * only ever runs `nix shell` / `nix develop` never creates one. Probe the two
 * documented symlink locations — `~/.nix-profile`, or `$XDG_STATE_HOME/nix/profile`
 * when `use-xdg-base-directories` is on — then fall back to `NIX_PROFILES`.
 */
function hasUserProfile(): boolean {
  if (profileCandidates().some(pathExists)) return true;
  return ownedEnvProfiles().length > 0;
}

/**
 * `NIX_PROFILES` is not a "this user has a profile" flag: the installer's
 * profile script exports the *system* profile into it too
 * (`/nix/var/nix/profiles/default $HOME/.nix-profile`), so taking it as-is
 * would emit the profile row for every user of every daemon install. Only
 * entries under the user's own home count.
 */
function ownedEnvProfiles(): string[] {
  const home = safeHomedir();
  if (!home) return [];
  const prefix = home.endsWith("/") ? home : `${home}/`;
  return (process.env.NIX_PROFILES ?? "")
    .split(/\s+/)
    .filter((entry) => entry.startsWith(prefix));
}

function profileCandidates(): string[] {
  const home = safeHomedir();
  if (!home) return [];
  const xdgState = process.env.XDG_STATE_HOME;
  const stateHome =
    xdgState && xdgState.length > 0 ? xdgState : posixPath.join(home, ".local", "state");
  return [
    posixPath.join(home, ".nix-profile"),
    posixPath.join(stateHome, "nix", "profile"),
  ];
}

/** `homedir()` throws when the platform cannot resolve a home directory. */
function safeHomedir(): string | null {
  try {
    const home = homedir();
    return home.length > 0 ? home : null;
  } catch {
    return null;
  }
}

function pathExists(path: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe; the paths come from homedir() / $XDG_STATE_HOME joined with hardcoded basenames. Same trust boundary as the process itself.
    return existsSync(path);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

async function upgradeBinary(): Promise<UpdateOutcome> {
  const { stdout, failed } = await run("nix", ["--version"]);
  const flavour = failed ? "standalone" : await detectFlavour(stdout);
  if (flavour !== "standalone") {
    return {
      id: BINARY_ID,
      success: false,
      skipped: true,
      message: FLAVOUR_SKIPS[flavour],
    };
  }

  const res = await runInherit("nix", ["upgrade-nix"]);
  if (!res.failed) return { id: BINARY_ID, success: true };
  return {
    id: BINARY_ID,
    success: false,
    message:
      "nix upgrade-nix a échoué : sur une install multi-utilisateur le profil " +
      "appartient à root, et un profil géré par nix profile est refusé par " +
      "upgrade-nix.",
  };
}

/**
 * `nix profile upgrade --all` is the modern path. `--all` and the whole `nix
 * profile` family belong to the new CLI, so on an older Nix the command dies on
 * an unknown flag or an unknown subcommand and we retry through the classic
 * profile tool.
 */
async function upgradeProfile(): Promise<UpdateOutcome> {
  const res = await runInherit("nix", [
    "--extra-experimental-features",
    EXPERIMENTAL_FEATURES,
    "profile",
    "upgrade",
    "--all",
  ]);
  if (!res.failed) return { id: PROFILE_ID, success: true };
  // A Ctrl+C skip or a wall-clock kill is not "the command is unsupported":
  // retrying with nix-env would restart work the user just interrupted.
  if (res.aborted || res.timedOut) return { id: PROFILE_ID, success: false };
  if (isNixProfileManaged()) {
    return {
      id: PROFILE_ID,
      success: false,
      message:
        "nix profile upgrade --all a échoué. Pas de repli sur nix-env : ce " +
        "profil est géré par nix profile, nix-env mettrait à jour autre chose.",
    };
  }
  return legacyProfileUpgrade();
}

/**
 * Upstream's own discriminator (`getProfileDir()` in src/nix/upgrade-nix.cc):
 * a `manifest.json` marks a profile built by `nix profile`, a `manifest.nix`
 * one built by `nix-env`. They are distinct databases over distinct sets of
 * packages, so `nix-env -u` is only a meaningful retry for the second kind —
 * otherwise it would report success after upgrading nothing the user can see.
 */
function isNixProfileManaged(): boolean {
  return profileCandidates().some((dir) =>
    pathExists(posixPath.join(dir, "manifest.json")),
  );
}

async function legacyProfileUpgrade(): Promise<UpdateOutcome> {
  if (!(await commandExists("nix-env"))) {
    return {
      id: PROFILE_ID,
      success: false,
      message: "nix profile upgrade --all a échoué et nix-env est introuvable.",
    };
  }
  // "*" is not a regex here: nix-env special-cases that exact selector to mean
  // "every package" (DrvName::matches in libstore/names.cc).
  const res = await runInherit("nix-env", ["-u", "*"]);
  return {
    id: PROFILE_ID,
    success: !res.failed,
    ...(res.failed && {
      message: "nix profile upgrade --all puis nix-env -u '*' ont échoué.",
    }),
  };
}

// ---------------------------------------------------------------------------
// Upstream version lookup
// ---------------------------------------------------------------------------

/**
 * NixOS/nix publishes no GitHub *Releases* — the repository carries git tags
 * only, so `/releases/latest` answers 404 and `/releases` an empty array
 * (verified). `fetchGitHubReleaseLatest` is therefore deliberately NOT used for
 * this repo: it could only ever return null while still spending one of the 60
 * unauthenticated api.github.com calls per hour that every provider in this
 * codebase shares. Determinate does cut releases, and that path uses the shared
 * helper.
 */
async function fetchLatestNixTag(): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${NIX_REPO}/tags?per_page=100`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    // A rate-limited or error body is an object, not an array; `.map` on it
    // would throw out of the scan.
    if (!Array.isArray(body)) return null;
    return highestStableTag(body.map(readTagName));
  } catch {
    return null;
  }
}

function readTagName(entry: unknown): string {
  if (typeof entry !== "object" || entry === null) return "";
  const { name } = entry as { name?: unknown };
  return typeof name === "string" ? name : "";
}

// ---------------------------------------------------------------------------
// Pure parsing (exported for tests)
// ---------------------------------------------------------------------------

/**
 * `nix --version` prints `"<program> (Nix) <version>"` upstream. The Determinate
 * build swaps the parenthetical for its own product version and keeps the
 * upstream one last: `"nix (Determinate Nix 3.21.9) 2.35.1"`. Taking the last
 * version-shaped token on the first line therefore reads the Nix version — the
 * one NixOS/nix tags track — under both builds.
 */
export function parseNixVersion(stdout: string): string | null {
  const line = firstNonEmptyLine(stdout);
  if (!line) return null;
  // eslint-disable-next-line security/detect-unsafe-regex -- `\d` and `\.` are disjoint character sets, so no input can backtrack between the groups; safe-regex false positive.
  const tokens = [...line.matchAll(/\d+\.\d+(?:\.\d+)?/g)];
  return tokens.at(-1)?.[0] ?? null;
}

/**
 * The Determinate product version, i.e. the number `determinate-nixd upgrade`
 * actually moves and the one `DeterminateSystems/nix-src` tags. Null on an
 * upstream build, and on a Determinate build whose banner ever stops carrying
 * a version — in which case no row is emitted rather than a wrong one.
 */
export function parseDeterminateVersion(stdout: string): string | null {
  const line = firstNonEmptyLine(stdout);
  if (!line) return null;
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored on a literal prefix, and `\d` / `\.` are disjoint so the optional group cannot backtrack; safe-regex false positive.
  const match = /\(determinate nix\s+v?(\d+\.\d+(?:\.\d+)?)/i.exec(line);
  return match?.[1] ?? null;
}

function firstNonEmptyLine(stdout: string): string | null {
  return stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? null;
}

const STABLE_TAG = /^\d+\.\d+\.\d+$/;

/**
 * The tags endpoint returns repository order, not version order, so the highest
 * version is picked explicitly rather than read off the first entry. Anything
 * that is not a bare `X.Y.Z` is dropped: a pre-release or a moving pointer tag
 * offered as "latest" would mark every stable install outdated forever.
 */
export function highestStableTag(names: readonly string[]): string | null {
  let best: string | null = null;
  for (const name of names) {
    const tag = name.trim();
    if (!STABLE_TAG.test(tag)) continue;
    if (best === null || compareNumericVersions(tag, best) > 0) best = tag;
  }
  return best;
}

/**
 * Negative when `a` is older than `b`, positive when newer, 0 when equal.
 * Component-wise and numeric on purpose: string ordering puts "1.10" before
 * "1.9", which would hide every upgrade past a x.9 release.
 */
export function compareNumericVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function versionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}
