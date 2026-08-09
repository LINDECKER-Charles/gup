import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import {
  describeSource,
  detectInstallSource,
  runPmUpdate,
  type InstallSource,
  type PackageIds,
} from "../../core/install-source.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Git for Windows — the distribution itself (git.exe plus its bundled MSYS2
 * runtime, Git Bash and credential helper), not the repositories it manages
 * and not any other git on PATH.
 *
 * The scope boundary is the whole reason this provider exists as a separate
 * one: `git` is the single most common binary on a developer machine and at
 * least four unrelated builds answer to that name (Cygwin's, MSYS2's, the WSL
 * distro's, Microsoft's `microsoft/git` fork). Only the Git for Windows build
 * has an upstream we can track and an updater we can drive, so `isAvailable`
 * gates on a positive identification rather than on `commandExists("git")`:
 * every Git for Windows release is tagged `v<upstream>.windows.<patchlevel>`
 * and reports that same string through `git --version`, so the `.windows.`
 * segment is the discriminator.
 *
 * Deliberately excluded, each of them silently:
 *  - upstream git, Cygwin git, MSYS2's own git, a WSL distro's git — no
 *    `.windows.` segment, so no row and no update proposal for a binary this
 *    provider does not own;
 *  - `microsoft/git` (Scalar / VFS for Git), which tags `.vfs.<n>.<n>` and
 *    tracks a different upstream repository entirely;
 *  - the repositories git operates on — `gup` updates tools, not checkouts.
 *
 * Both ends of the comparison are the same string by construction: the release
 * tag with its leading "v" stripped is character-for-character what
 * `git --version` prints (verified against `git-for-windows/git` releases and
 * against build-extra's own updater, which reads `git --version` and compares
 * it to the tag). The ordering is still done numerically rather than by string
 * equality — see {@link compareGitForWindowsVersions} — because the release
 * channel is not monotonic: an RC user can sit *ahead* of the latest stable
 * release, and `.windows.10` must sort after `.windows.9`.
 *
 * Updates are ownership-first (see core/install-source.ts). Git for Windows
 * ships a built-in updater, `git update-git-for-windows`, but running it on an
 * installation owned by scoop/choco/winget would swap the files under the
 * package manager's feet and leave its manifest lying about the installed
 * version. So the owning manager wins when there is one, and the built-in
 * updater is the fallback for a hand-installed setup.
 */
export class GitForWindowsProvider implements Provider {
  readonly id = "git-for-windows";
  readonly displayName = "Git for Windows";
  // Windows-only distribution: elsewhere `git` comes from the system package
  // manager (or the Command Line Tools on macOS), never from a package called
  // "git-for-windows".
  readonly installHint = pickInstallHint({
    win32: "winget install Git.Git",
    fallback: "Windows uniquement — équivalent macOS/Linux : brew install git",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (!(await commandExists("git").catch(() => false))) return false;
    return (await readInstalledVersion()) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      return await scanGitForWindows(this.id);
    } catch {
      // A provider that throws aborts its slot in the scan; an empty list just
      // means "nothing to report this run".
      return [];
    }
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    try {
      return await applyUpdate(this.id);
    } catch {
      return {
        id: this.id,
        success: false,
        message: `échec inattendu de la mise à jour — ${MANUAL_MESSAGE}`,
      };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    // Single-row provider: the whole distribution upgrades in one shot.
    return [await this.update(this.id)];
  }
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

const MANUAL_MESSAGE =
  "Télécharger l'installeur depuis https://gitforwindows.org/ et le relancer";

// `git` is the Chocolatey meta-package that depends on `git.install` (both
// published by the Git development community, same version stream); `Git.Git`
// is the winget id and `git` the scoop manifest name.
const PACKAGE_IDS: PackageIds = { scoop: "git", choco: "git", winget: "Git.Git" };

async function scanGitForWindows(id: string): Promise<OutdatedPackage[]> {
  const current = await readInstalledVersion();
  if (!current) return [];

  const latest = await fetchGitHubReleaseLatest("git-for-windows/git");
  if (!latest) return [];

  // Strictly older only: equal builds and an installed build that is *ahead*
  // of the latest stable release (RC channel) both mean "nothing to do", and
  // an unorderable pair means we cannot honestly claim an update exists.
  const order = compareGitForWindowsVersions(current, latest);
  if (order === null || order >= 0) return [];

  const source = await detectInstallSource("git");
  const updater = source === "manual" ? await probeBuiltinUpdater() : "unknown";
  return [
    {
      id,
      name: "Git for Windows",
      current,
      latest,
      note: describeUpdatePath(source, updater),
    },
  ];
}

/**
 * `describeSource` would label a hand-installed setup "manuel", which is only
 * half true here: that is precisely the case where the built-in updater
 * applies. So the note names the updater when the probe found it, and falls
 * back to a plain manual wording when it did not.
 */
function describeUpdatePath(source: InstallSource, updater: UpdaterState): string {
  if (source !== "manual") return describeSource(source);
  return updater === "present"
    ? "via git update-git-for-windows"
    : "installeur à relancer manuellement";
}

// ---------------------------------------------------------------------------
// Version parsing and ordering
// ---------------------------------------------------------------------------

// One bounded token after "git version", validated separately: a single
// character class with a capped quantifier, so no backtracking blowup.
const VERSION_LINE = /git version\s+(\S{1,128})/i;

// The tag shape is `<upstream>[.-]rc<n>?.windows.<patchlevel>`, taken apart by
// string splitting rather than by one composite pattern: an optional group
// wrapped around a quantified class is exactly the construct safe-regex flags,
// and three separately anchored single-quantifier patterns are both provably
// linear and easier to read.
const WINDOWS_MARKER = ".windows.";
const PATCHLEVEL_SHAPE = /^\d{1,6}$/;
// The rc marker appears with either separator — `2.32.0-rc0.windows.1` and
// `2.34.0.rc1.windows.1` are both real tags.
const RC_SUFFIX_SHAPE = /[.-]rc(\d{1,4})$/i;
const UPSTREAM_SHAPE = /^\d[\d.]{0,31}$/;

interface GitForWindowsVersion {
  /** Upstream git version, numeric segments only: `2.55.0` → `[2, 55, 0]`. */
  upstream: number[];
  /** Release-candidate number, or null for a final release. */
  rc: number | null;
  /** Git for Windows patchlevel — the N in `.windows.N`. */
  patch: number;
}

/**
 * `git --version` on a Git for Windows build prints:
 *
 *   git version 2.55.0.windows.3
 *
 * The trailing `.windows.<patchlevel>` is what identifies the distribution;
 * upstream git, Cygwin's git and a WSL git all stop at the upstream version,
 * and `microsoft/git` says `.vfs.` instead. Returns null for all of those,
 * which is how `isAvailable` rules them out.
 *
 * Release candidates (`2.55.0-rc2.windows.1`) parse: narrowing the shape to
 * plain digits would make the provider vanish for anyone on the RC channel.
 */
export function parseGitForWindowsVersion(stdout: string): string | null {
  const token = stdout.match(VERSION_LINE)?.[1];
  if (!token) return null;
  return parseVersion(token) === null ? null : token;
}

/**
 * Order two Git for Windows version strings numerically.
 *
 * Negative when `a` is older than `b`, 0 for the same build, positive when `a`
 * is newer, and **null when either side cannot be ordered** (an unexpected tag
 * shape from the API, say) so callers can decline to invent an answer.
 *
 * String comparison is not good enough on either axis: `2.9.0` vs `2.10.0` and
 * `.windows.9` vs `.windows.10` both sort backwards lexicographically, and a
 * bare `!==` cannot tell an available upgrade from an installed build that is
 * already ahead of the latest stable release.
 */
export function compareGitForWindowsVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  const width = Math.max(left.upstream.length, right.upstream.length);
  for (let i = 0; i < width; i++) {
    const diff = (left.upstream[i] ?? 0) - (right.upstream[i] ?? 0);
    if (diff !== 0) return diff;
  }
  const rc = compareRc(left.rc, right.rc);
  if (rc !== 0) return rc;
  return left.patch - right.patch;
}

/** Semver rule: a final release outranks any release candidate of same core. */
function compareRc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Structural parse of a Git for Windows version string. Null for anything that
 * is not one — which is both the "some other git" verdict of `isAvailable` and
 * the "cannot be ordered" verdict of the comparator.
 */
function parseVersion(version: string): GitForWindowsVersion | null {
  const raw = version.trim();
  // `lastIndexOf` so a hypothetical upstream segment named "windows" cannot
  // steal the split; the patchlevel marker is always the trailing one.
  const marker = raw.toLowerCase().lastIndexOf(WINDOWS_MARKER);
  if (marker <= 0) return null;

  const patchRaw = raw.slice(marker + WINDOWS_MARKER.length);
  if (!PATCHLEVEL_SHAPE.test(patchRaw)) return null;

  const beforeMarker = raw.slice(0, marker);
  const rcMatch = RC_SUFFIX_SHAPE.exec(beforeMarker);
  const core = rcMatch ? beforeMarker.slice(0, -rcMatch[0].length) : beforeMarker;
  if (!UPSTREAM_SHAPE.test(core)) return null;

  const upstream = core
    .split(".")
    .filter((segment) => segment.length > 0)
    .map(Number);
  if (upstream.length === 0) return null;

  const rcRaw = rcMatch?.[1];
  return {
    upstream,
    rc: rcRaw === undefined ? null : Number(rcRaw),
    patch: Number(patchRaw),
  };
}

async function readInstalledVersion(): Promise<string | null> {
  try {
    const { stdout, failed } = await run("git", ["--version"]);
    if (failed) return null;
    return parseGitForWindowsVersion(stdout);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

type UpdaterState = "present" | "absent" | "unknown";

async function applyUpdate(id: string): Promise<UpdateOutcome> {
  const source = await detectInstallSource("git");
  if (source !== "manual") {
    return runPmUpdate(id, source, PACKAGE_IDS, MANUAL_MESSAGE);
  }
  if ((await probeBuiltinUpdater()) !== "present") {
    return {
      id,
      success: false,
      skipped: true,
      message: `updater intégré absent de cette installation — ${MANUAL_MESSAGE}`,
    };
  }
  return runBuiltinUpdater(id);
}

/**
 * Offline probe for the built-in updater, which ships in `mingw64/bin` with
 * the standard installer and the portable archive but not with MinGit.
 *
 * `-h` is matched by the option loop at the very top of the script, before any
 * network work, and makes it print its own usage banner and return 1. That
 * banner is a plain `printf` in a shell script — it is never translated —
 * whereas git's "is not a git command" dispatch error is localised and exits 1
 * too, so the banner is the only signal worth trusting. Anything else counts
 * as absent: refusing to spawn a command we could not identify is the safe
 * direction for an updater that kills running Git Bash sessions and starts a
 * silent installer.
 *
 * The explicit cap is belt-and-braces against an older build that might reach
 * the network before parsing options; `run` is otherwise unbounded.
 */
async function probeBuiltinUpdater(): Promise<UpdaterState> {
  try {
    const { stdout, stderr } = await run("git", ["update-git-for-windows", "-h"], {
      timeout: 10_000,
    });
    return /usage:\s*git update-git-for-windows/i.test(`${stdout}\n${stderr}`)
      ? "present"
      : "absent";
  } catch {
    return "absent";
  }
}

/**
 * Git for Windows' own updater. Its return codes (documented in the usage
 * banner it prints, and matching `return 2` at the end of build-extra's
 * `git-extra/git-update-git-for-windows`) are not the usual 0/non-zero split:
 *
 *   0 — no update available
 *   1 — an update is available and the user declined it, *or* the option loop
 *       rejected an argument and printed its usage banner instead
 *   2 — an update is available and the installer was started
 *
 * so the plain `!res.failed` shortcut every other provider uses would report
 * the successful case (2) as a failure. `-y, --yes` answers the download
 * prompt, which makes "declined" unreachable — leaving an option-parsing
 * refusal as the only way to see 1, i.e. an updater too old to know `--yes`.
 *
 * Code 2 comes back as soon as the installer is launched: it runs detached
 * with `//SILENT //NORESTART`, and the script kills every running Git Bash on
 * its way out. Hence the advisory message rather than a bare success.
 */
async function runBuiltinUpdater(id: string): Promise<UpdateOutcome> {
  const { exitCode } = await runInherit("git", ["update-git-for-windows", "--yes"]);
  if (exitCode === 2) {
    return {
      id,
      success: true,
      message:
        "installeur lancé en arrière-plan — les sessions Git Bash ouvertes ont été fermées",
    };
  }
  if (exitCode === 0) {
    return { id, success: true, message: "aucune mise à jour proposée par git" };
  }
  if (exitCode === 1) {
    return {
      id,
      success: false,
      message: `l'updater intégré a refusé l'option --yes (version trop ancienne) — ${MANUAL_MESSAGE}`,
    };
  }
  return {
    id,
    success: false,
    message: `git update-git-for-windows a échoué (code ${String(exitCode)}) — ${MANUAL_MESSAGE}`,
  };
}
