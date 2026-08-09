import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix as posixPath } from "node:path";

import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit, whichFirst } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
  resolveBinaryPath,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest, normalizeVersion } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

const ID = "pyenv";

/**
 * Shown when no automatic path applies: either nothing on the machine claims
 * the binary, or the owning package manager has no pyenv package we can name.
 * `brew` and `apt` are declared below (Homebrew ships the `pyenv` formula,
 * Debian the `pyenv` package since trixie); Fedora has no pyenv in its
 * repositories, so a dnf-owned binary lands here.
 */
const MANUAL_MESSAGE =
  "Aucune mise à jour automatique pour cette installation de pyenv : mettre à jour le clone git (cd $(pyenv root) && git pull --ff-only) ou réinstaller via https://pyenv.run";

/**
 * pyenv (pyenv/pyenv) — the POSIX original.
 *
 * pyenv-win (pyenv-win/pyenv-win, covered by `./pyenv-win.ts`) is a *separate
 * upstream project*, not a Windows build of this one: different repository,
 * different version line, different self-update story. Both expose a binary
 * named `pyenv`, so the two providers gate on opposite platforms — that one
 * requires win32, this one refuses it — and a machine never shows two rows for
 * what the user thinks of as "pyenv".
 *
 * Scope is the pyenv binary itself. The Python versions it manages stay out:
 * `pyenv install <x>` adds an interpreter rather than upgrading one, and pyenv
 * never reports an installed version as outdated. Plugins under
 * `$PYENV_ROOT/plugins` are out too — each is an independent repository with
 * its own release policy, and pyenv has no command that enumerates their
 * versions.
 *
 * `pyenv --version` prints "pyenv 2.8.3", or "pyenv 2.8.3-12-gabc1234" on a
 * checkout sitting ahead of the last tag (upstream `libexec/pyenv---version`
 * echoes `git describe --tags HEAD` with the leading "v" stripped, falling back
 * to the hardcoded version). Only the release component is compared, and only
 * numerically, so neither a development checkout nor a tag that GitHub has not
 * published as a release yet is ever reported as outdated.
 *
 * Update, in this order:
 *  1. git-clone install (a `.git` under `pyenv root` *and* the `pyenv` on PATH
 *     living inside that root) -> `git pull --ff-only`. `pyenv update` is
 *     deliberately NOT used: it is not a built-in subcommand, it ships with the
 *     separate pyenv-update plugin, so it fails on any install that did not
 *     come from the automatic installer.
 *  2. anything else -> delegate to whichever package manager owns the binary
 *     (`brew upgrade --formula pyenv` in practice, per upstream's README).
 *
 * No row is ever flagged `manual: true`: scanAll drops those outright, and an
 * upgrade the user could apply by hand is worth showing. The rows that have no
 * automatic path say so through an `update()` that returns `skipped`.
 */
export class PyenvProvider implements Provider {
  readonly id = ID;
  readonly displayName = "pyenv";
  readonly installHint = pickInstallHint({
    win32:
      "Windows : passer par pyenv-win, un projet distinct — https://github.com/pyenv-win/pyenv-win",
    darwin: "brew install pyenv",
    linux: "curl -fsSL https://pyenv.run | bash",
    fallback: "Installeur officiel : curl -fsSL https://pyenv.run | bash",
  });

  async isAvailable(): Promise<boolean> {
    // On Windows the `pyenv` on PATH belongs to pyenv-win, whose provider
    // already owns that row.
    if (process.platform === "win32") return false;
    try {
      return await commandExists("pyenv");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      return await scan();
    } catch {
      // A provider that throws aborts nothing but still surfaces as a scan
      // error; an unreadable pyenv is simply "nothing to report".
      return [];
    }
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    try {
      const root = await gitCheckoutRoot();
      if (root) return await pullCheckout(root);

      return await delegateUpdate({
        id: ID,
        binary: "pyenv",
        // Both ids are the upstream package names, verified rather than
        // guessed: `brew install pyenv` is what pyenv's own README documents,
        // and Debian ships a `pyenv` package from trixie onwards. Fedora has
        // none, so no `dnf` id — a dnf-owned binary gets MANUAL_MESSAGE.
        packageIds: { brew: "pyenv", apt: "pyenv" },
        manualMessage: MANUAL_MESSAGE,
      });
    } catch {
      return { id: ID, success: false, message: MANUAL_MESSAGE };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update(ID)];
  }
}

export interface PyenvVersion {
  /** Exactly what the binary printed, e.g. "2.8.3-12-gabc1234". */
  raw: string;
  /** Release component alone, e.g. "2.8.3" — the only comparable part. */
  release: string;
}

/**
 * Parse `pyenv --version`. Upstream echoes `pyenv ${git_revision:-$version}`
 * where git_revision is `git describe --tags HEAD` with the leading "v"
 * stripped, so both shapes below are legitimate output:
 *
 *   pyenv 2.8.3
 *   pyenv 2.8.3-12-gabc1234
 *
 * The `-<commits>-g<sha>` tail means "ahead of that tag", never "older than
 * it", so it is cut off before any comparison — keeping it would report every
 * development checkout as outdated forever.
 */
export function parsePyenvVersion(stdout: string): PyenvVersion | null {
  const match = stdout.match(/pyenv\s+v?([0-9][\w.+-]*)/i);
  const raw = match?.[1];
  if (!raw) return null;
  return { raw, release: raw.replace(/-\d+-g[0-9a-f]{4,}$/i, "") };
}

/**
 * Component-wise numeric comparison of two dotted versions: negative when `a`
 * is older, 0 when equal, positive when newer. Returns null when either side
 * is not a dotted numeric version, which is the caller's signal to stay quiet.
 *
 * String inequality is not usable here: it orders "2.10.0" before "2.9.0", and
 * it also fires whenever the installed tag is *ahead* of what the GitHub
 * releases feed exposes — a real gap, since tags land before the release is
 * published.
 */
export function compareReleases(a: string, b: string): number | null {
  const left = numericParts(a);
  const right = numericParts(b);
  if (!left || !right) return null;

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Split a dotted version into its numeric components, or null when any of them
 * is not a plain integer (a pre-release tag, a git suffix, a fork's scheme).
 *
 * Validated component by component with a `\d+` anchored on a single segment
 * rather than as one `^\d+(?:\.\d+)*$` pass: the nested quantifier in that
 * shape trips eslint-plugin-security's unsafe-regex detector, and the loop is
 * both linear by construction and cheaper to read than an exemption comment.
 */
function numericParts(version: string): number[] | null {
  const parts = normalizeVersion(version).split(".");
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    out.push(Number(part));
  }
  return out.length > 0 ? out : null;
}

/** The scan proper. Split out so listOutdated is a single guarded call. */
async function scan(): Promise<OutdatedPackage[]> {
  const { stdout, failed } = await run("pyenv", ["--version"]);
  if (failed) return [];

  const version = parsePyenvVersion(stdout);
  if (!version) return [];

  const latest = await fetchGitHubReleaseLatest("pyenv/pyenv");
  if (!latest) return [];

  // Only a proven "installed < published" produces a row. An unparseable
  // version on either side (a fork tagged off pyenv's scheme) yields null and
  // is treated as "no upgrade known" rather than guessed at.
  const order = compareReleases(version.release, latest);
  if (order === null || order >= 0) return [];

  return [await buildRow(version.raw, latest)];
}

/**
 * Build the single row, including the note announcing which update path
 * update() will take.
 *
 * The git checkout is tested first and wins. A clone install puts the binary
 * in `$PYENV_ROOT/bin`, which no package manager owns, so detectInstallSource
 * answers "manual" while `git pull` handles the upgrade perfectly.
 */
async function buildRow(current: string, latest: string): Promise<OutdatedPackage> {
  if (await gitCheckoutRoot()) {
    return {
      id: ID,
      name: "pyenv",
      current,
      latest,
      note: "clone git — git pull --ff-only",
    };
  }

  const source = await detectInstallSource("pyenv");
  return {
    id: ID,
    name: "pyenv",
    current,
    latest,
    note:
      source === "manual"
        ? "source inconnue — mise à jour manuelle"
        : describeSource(source),
  };
}

/**
 * Root of a git-clone install, or null when pyenv came from somewhere else.
 *
 * Two conditions, both required. `.git` under the root alone is not proof: the
 * root is a *data* directory (versions, shims) that every install shape uses,
 * so a Homebrew pyenv on PATH next to a leftover `~/.pyenv` clone would match
 * it — and gup would then fast-forward a checkout that is not the binary being
 * reported, print "success", and leave the outdated brew install in place. So
 * the binary on PATH must also live inside the root.
 *
 * Never throws: a failed probe just means "not a clone", and update() then
 * degrades to package-manager delegation.
 */
async function gitCheckoutRoot(): Promise<string | null> {
  try {
    const root = await pyenvRoot();
    if (!root) return null;
    // A linked worktree stores `.git` as a file rather than a directory, and
    // existsSync accepts both.
    //
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe on the pyenv root, i.e. a directory owned by the user running gup: same trust boundary as the process itself.
    if (!existsSync(posixPath.join(root, ".git"))) return null;
    return (await binaryLivesUnder(root)) ? root : null;
  } catch {
    return null;
  }
}

/**
 * True when the `pyenv` that PATH resolves to sits inside `root`.
 *
 * Both the raw PATH hit and its symlink-resolved target are accepted, because
 * either one can be the honest answer: a clone whose root is itself a symlink
 * (`~/.pyenv` -> `/data/pyenv`, common in dotfiles setups) matches on the raw
 * path, while a hand-made shortcut into the clone (`~/.local/bin/pyenv`)
 * matches only once resolved. A Homebrew install matches neither — it resolves
 * into the Cellar.
 *
 * When PATH resolves to nothing at all there is nothing to contradict the
 * `.git` we just found, so the clone answer stands rather than being downgraded
 * to a delegation that would report "no automatic path" for a checkout gup can
 * perfectly well fast-forward.
 */
async function binaryLivesUnder(root: string): Promise<boolean> {
  const onPath = await whichFirst("pyenv");
  if (!onPath) return true;
  if (isInside(onPath, root)) return true;

  const resolved = await resolveBinaryPath("pyenv");
  return resolved !== null && isInside(resolved, root);
}

/** Path containment, on the separator rather than on the raw prefix. */
function isInside(child: string, parent: string): boolean {
  const base = parent.endsWith("/") ? parent : `${parent}/`;
  return child.startsWith(base);
}

/**
 * The pyenv root. `pyenv root` is a documented subcommand and is what upstream
 * itself uses (`cd $(pyenv root) && git pull`), so it is authoritative — it
 * knows about a PYENV_ROOT that was exported in a shell rc gup never sourced.
 * The env var and upstream's documented `~/.pyenv` default are the fallback
 * for when the binary refuses to answer.
 *
 * Only absolute answers are kept. `pyenv root` echoes `$PYENV_ROOT` verbatim,
 * so a relative value exported by the user comes straight back out — and every
 * caller here resolves it against gup's cwd, which has nothing to do with
 * pyenv. Rejecting it falls through to the next candidate instead.
 *
 * POSIX paths by construction: isAvailable() has already refused win32.
 */
async function pyenvRoot(): Promise<string | null> {
  const { stdout, failed } = await run("pyenv", ["root"]);
  const reported = failed ? "" : (stdout.split(/\r?\n/)[0] ?? "").trim();
  if (posixPath.isAbsolute(reported)) return reported;

  const fromEnv = process.env["PYENV_ROOT"]?.trim() ?? "";
  if (posixPath.isAbsolute(fromEnv)) return fromEnv;

  try {
    const home = homedir().trim();
    return posixPath.isAbsolute(home) ? posixPath.join(home, ".pyenv") : null;
  } catch {
    // homedir() surfaces the OS error when no home can be resolved.
    return null;
  }
}

/**
 * `--ff-only` on purpose: a checkout pinned to a tag or carrying a local commit
 * must fail loudly here instead of having gup open a merge behind the user's
 * back in a directory they own.
 */
async function pullCheckout(root: string): Promise<UpdateOutcome> {
  try {
    const res = await runInherit("git", ["-C", root, "pull", "--ff-only"]);
    if (!res.failed) return { id: ID, success: true };
    return {
      id: ID,
      success: false,
      message: `git pull --ff-only a échoué dans ${root} — HEAD détaché sur un tag, commits locaux ou branche divergente`,
    };
  } catch {
    return {
      id: ID,
      success: false,
      message: `Impossible de lancer git sur ${root} — git absent du PATH ou racine pyenv invalide`,
    };
  }
}
