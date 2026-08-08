import { realpath } from "node:fs/promises";

import { run, runInherit } from "./runner.js";
import type { UpdateOutcome } from "./types.js";

export type InstallSource =
  | "scoop"
  | "choco"
  | "winget"
  | "brew"
  | "apt"
  | "dnf"
  | "manual";

/**
 * Locate a binary in PATH and infer which package manager (if any) owns it
 * by matching well-known install directories.
 *
 * Two POSIX-only refinements sit on top of the plain path match:
 *
 *  - **symlink resolution.** Homebrew installs into a private prefix and only
 *    exposes a symlink on PATH (`/opt/homebrew/bin/kubectl` →
 *    `../Cellar/kubernetes-cli/1.36.3/bin/kubectl`). `which` reports the link,
 *    so without resolving it every brew install classifies as `manual` — and
 *    `manual` entries are dropped from scan results, silently hiding real
 *    upgrades on macOS.
 *  - **package-database probe.** Distro packages land in shared prefixes
 *    (`/usr/bin`) that carry no ownership signal in the path itself; `dpkg -S`
 *    / `rpm -qf` are the only reliable answer.
 *
 * The win32 branch is unchanged: no realpath call, no probe.
 */
export async function detectInstallSource(binary: string): Promise<InstallSource> {
  const resolved = await resolveBinaryPath(binary);
  if (!resolved) return "manual";

  const fromPath = inferSourceFromPath(resolved);
  if (fromPath !== "manual") return fromPath;

  if (process.platform === "linux") return detectLinuxPackageOwner(resolved);
  return "manual";
}

/**
 * PATH-first resolution for a binary, with POSIX symlinks followed.
 *
 * Shared with core/ownership.ts so both detectors classify a Homebrew shim by
 * its real Cellar location instead of the `<prefix>/bin` symlink `which`
 * reports. Returns null when the binary is not on PATH.
 */
export async function resolveBinaryPath(binary: string): Promise<string | null> {
  const isWindows = process.platform === "win32";
  const probe = isWindows ? "where" : "which";
  const { stdout, failed } = await run(probe, [binary]);
  if (failed) return null;
  const first = stdout.split(/\r?\n/)[0]?.trim() ?? "";
  if (!first) return null;
  return isWindows ? first : resolveSymlink(first);
}

export function inferSourceFromPath(path: string): InstallSource {
  const lower = path.toLowerCase();
  if (lower.includes("\\scoop\\")) return "scoop";
  if (lower.includes("chocolatey")) return "choco";
  if (
    lower.includes("\\winget\\") ||
    lower.includes("\\windowsapps\\") ||
    lower.includes("\\appdata\\local\\programs\\")
  )
    return "winget";
  if (isHomebrewPath(lower)) return "brew";
  return "manual";
}

/**
 * Homebrew classification, deliberately conservative.
 *
 * Every brew install physically lives under `<prefix>/Cellar` (formulae) or
 * `<prefix>/Caskroom` (casks). The prefix is one of three well-known roots:
 * `/opt/homebrew` (Apple Silicon), `/usr/local` (Intel), and
 * `/home/linuxbrew/.linuxbrew` (Linuxbrew, or `~/.linuxbrew` for an unprivileged
 * install).
 *
 * Matching on the `Cellar` segment *alone* would be too loose: this classifier
 * decides which package manager we hand an upgrade to, and a user directory
 * literally named `cellar` would then route `brew upgrade` at a binary brew
 * does not own — the exact misclassification `tests/security/install-source.ts`
 * exists to prevent. So a Cellar/Caskroom hit only counts under a known prefix.
 *
 * `/usr/local` is the one prefix that is NOT brew-exclusive — it is also the
 * classic hand-install location — so it is accepted only in combination with a
 * Cellar/Caskroom segment, never on its own.
 *
 * Every pattern is forward-slash anchored, so no Windows path can reach here.
 */
function isHomebrewPath(lower: string): boolean {
  const isLinuxbrew =
    lower.startsWith("/home/linuxbrew/.linuxbrew/") || lower.includes("/.linuxbrew/");
  // Prefixes that belong to Homebrew and nothing else.
  if (lower.startsWith("/opt/homebrew/") || isLinuxbrew) return true;

  const underKegRoot = lower.includes("/cellar/") || lower.includes("/caskroom/");
  return underKegRoot && lower.startsWith("/usr/local/");
}

/**
 * Resolve a PATH hit through its symlink chain. Falls back to the original
 * value on any error (broken link, permission, or a synthetic path in tests)
 * so detection degrades to the previous path-only behaviour instead of
 * throwing mid-scan.
 */
async function resolveSymlink(path: string): Promise<string> {
  try {
    // The argument is the first line of `which <binary>` output — a path the
    // OS resolved from PATH, never user input. The call is read-only (it walks
    // a symlink chain, opens nothing) and any failure is swallowed below, so a
    // hostile PATH entry can at worst make detection fall back to the
    // unresolved path, which is the pre-existing behaviour.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see above
    return await realpath(path);
  } catch {
    return path;
  }
}

/**
 * Ask the distro package database who owns a file. Only consulted for paths
 * under a system prefix — a binary in `~/.local/bin` is never dpkg-tracked
 * and probing it would just cost two process spawns per provider.
 */
async function detectLinuxPackageOwner(path: string): Promise<InstallSource> {
  if (!/^\/(usr|bin|sbin|opt|etc)\//.test(path)) return "manual";
  if (await fileIsTrackedBy("dpkg", ["-S", path])) return "apt";
  if (await fileIsTrackedBy("rpm", ["-qf", path])) return "dnf";
  return "manual";
}

/**
 * True when `<cmd> <args>` names an owning package. Both dpkg and rpm exit
 * non-zero for untracked files, and simply fail to spawn when the tool is
 * absent (dpkg on Fedora, rpm on Debian) — both mean "not owned here".
 * Written defensively against a missing/odd result so a probe can never
 * break a scan.
 */
async function fileIsTrackedBy(cmd: string, args: string[]): Promise<boolean> {
  try {
    const res = await run(cmd, args);
    return Boolean(res && !res.failed && res.stdout?.trim());
  } catch {
    return false;
  }
}

export interface PackageIds {
  scoop?: string;
  choco?: string;
  winget?: string;
  /** Homebrew formula name (`brew upgrade <formula>`). */
  brew?: string;
  /**
   * Homebrew cask token, for GUI apps and binary-only distributions that ship
   * as a cask rather than a formula. Takes precedence over `brew` when both
   * are set, since a cask install cannot be upgraded through the formula path.
   */
  brewCask?: string;
  /** Debian/Ubuntu package name (`apt-get install --only-upgrade <pkg>`). */
  apt?: string;
  /** Fedora/RHEL package name (`dnf upgrade <pkg>`). */
  dnf?: string;
}

/**
 * Drive an upgrade through a specific package manager. Used when the source
 * is already known (e.g. JetBrains provider that detected it during scan)
 * and re-probing would be wasteful or incorrect.
 */
interface UpgradeCommand {
  command: string;
  args: string[];
  shell?: boolean;
}

/**
 * Commande d'upgrade par gestionnaire, ou null quand `packageIds` ne porte pas
 * l'identifiant qu'il faut — auquel cas l'appelant retombe sur le message
 * manuel. Table plutôt que `switch` : chaque gestionnaire se lit d'un bloc, et
 * en ajouter un ne rallonge aucune fonction.
 */
const UPGRADE_COMMANDS: Record<
  Exclude<InstallSource, "manual">,
  (ids: PackageIds) => UpgradeCommand | null
> = {
  scoop: (ids) =>
    ids.scoop
      ? { command: "scoop", args: ["update", ids.scoop], shell: true }
      : null,
  choco: (ids) =>
    ids.choco ? { command: "choco", args: ["upgrade", ids.choco, "-y"] } : null,
  winget: (ids) =>
    ids.winget
      ? {
          command: "winget",
          args: [
            "upgrade",
            "--id",
            ids.winget,
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
          ],
        }
      : null,
  // A cask and a formula of the same name are different installs with
  // different upgrade commands, so the cask token wins when present.
  brew: (ids) => {
    if (ids.brewCask) {
      return { command: "brew", args: ["upgrade", "--cask", ids.brewCask] };
    }
    if (!ids.brew) return null;
    return { command: "brew", args: ["upgrade", "--formula", ids.brew] };
  },
  // `install --only-upgrade` rather than `upgrade <pkg>`: the latter is not a
  // real apt-get subcommand and would upgrade the whole system on apt(8).
  apt: (ids) =>
    ids.apt
      ? {
          command: "sudo",
          args: ["apt-get", "install", "--only-upgrade", "-y", ids.apt],
        }
      : null,
  dnf: (ids) =>
    ids.dnf
      ? { command: "sudo", args: ["dnf", "upgrade", "-y", ids.dnf] }
      : null,
};

// eslint-disable-next-line max-params -- signature publique appelée depuis ~40 providers ; les 4 arguments sont cohésifs et `delegateUpdate` offre déjà la variante objet.
export async function runPmUpdate(
  id: string,
  source: InstallSource,
  packageIds: PackageIds,
  manualMessage: string,
): Promise<UpdateOutcome> {
  const build = source === "manual" ? null : UPGRADE_COMMANDS[source];
  const spec = build?.(packageIds);
  if (!spec) {
    return { id, success: false, skipped: true, message: manualMessage };
  }
  return runDelegated(id, spec);
}

export interface DelegateUpdateOptions {
  id: string;
  /** Binary name to locate (e.g. "terraform") for source detection. */
  binary: string;
  packageIds: PackageIds;
  manualMessage: string;
}

/**
 * Convenience: detect the source from a binary name in PATH and run the
 * corresponding upgrade in one call. Used by providers that don't track
 * the install path themselves (symfony-cli, terraform, pulumi, kubectl).
 */
export async function delegateUpdate(
  options: DelegateUpdateOptions,
): Promise<UpdateOutcome> {
  const source = await detectInstallSource(options.binary);
  return runPmUpdate(options.id, source, options.packageIds, options.manualMessage);
}

async function runDelegated(
  id: string,
  spec: UpgradeCommand,
): Promise<UpdateOutcome> {
  const options = spec.shell === undefined ? {} : { shell: spec.shell };
  const res = await runInherit(spec.command, spec.args, options);
  return { id, success: !res.failed };
}

export function describeSource(source: InstallSource): string {
  switch (source) {
    case "scoop":
      return "via scoop";
    case "choco":
      return "via choco";
    case "winget":
      return "via winget";
    case "brew":
      return "via brew";
    case "apt":
      return "via apt";
    case "dnf":
      return "via dnf";
    case "manual":
      return "manuel";
  }
}
