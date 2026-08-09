import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix as posixPath } from "node:path";

import {
  fetchGitHubReleaseLatest,
  normalizeVersion,
} from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/** Single tracked artefact: nvm itself. */
const ID = "nvm";

const REPO = "nvm-sh/nvm";

const INSTALL_DOC = "https://github.com/nvm-sh/nvm#installing-and-updating";

/** Shown when the install is not a clone, i.e. when no automatic path exists. */
const MANUAL_MESSAGE = `Installation nvm hors dépôt git — mettre à jour en suivant ${INSTALL_DOC}`;

/**
 * nvm (nvm-sh/nvm) — the POSIX Node version manager.
 *
 * Scope is the nvm INSTALLATION itself, never the Node versions it manages:
 * which Node a user keeps installed is a deliberate choice, not an outdated
 * package. The unrelated Windows project that shares the name is handled by
 * nvm-windows.ts, so this provider stays inert on win32 and that one stays
 * inert everywhere else.
 *
 * Detection cannot go through PATH. nvm is a shell function defined by sourcing
 * `$NVM_DIR/nvm.sh` — the README states outright that "which nvm will not work,
 * since nvm is a sourced shell function, not an executable binary". So we look
 * for nvm.sh on disk and read the version by sourcing it inside a bash child,
 * the same shape sdkman.ts uses for the same reason. `--no-use` on the sourcing
 * line and `nvm --version` are both real upstream surface: the first is what
 * nvm's own install snippet appends (`nvm_process_parameters` maps it to
 * `nvm_auto none`), the second is a `"--version" | "-v"` branch in nvm.sh that
 * echoes the bare number and is listed in `nvm --help`. It is deliberately NOT
 * documented in the README prose, which is why it is asserted against the
 * script instead.
 *
 * Upgrade policy: nvm's headline upgrade instruction is to re-run its install
 * script through `curl … | bash`. Downloading and executing a remote script is
 * out of the question here, so that path is deliberately NOT implemented.
 * The README's own manual-upgrade recipe — fetch the tags in `$NVM_DIR`, check
 * out the newest one — reaches the same result on a git checkout, and that is
 * what we run. Installs that are not a git checkout (distro package, copied
 * tree) are surfaced but SKIPped with a pointer upstream; the Homebrew formula
 * is out of scope entirely, since it keeps nvm.sh under
 * `$(brew --prefix)/opt/nvm` rather than in NVM_DIR and never matches here.
 *
 * The one deviation from the README recipe is how the target tag is chosen:
 * upstream computes the newest local tag with `git describe`, we take the tag
 * of GitHub's latest release (bounded by the shared, timeout-capped helper).
 * Those can drift — a tag can exist before its release is published — so both
 * the scan and the update compare NUMERICALLY and refuse to move unless the
 * published release is strictly newer than what is installed. Otherwise the
 * "upgrade" would be a `git checkout` onto an older tag, i.e. a silent
 * downgrade.
 *
 * No row is ever flagged `manual: true`: scanAll drops those outright, which
 * would make the non-git install invisible instead of actionable. It is a
 * normal row whose update() returns `skipped`.
 */
export class NvmProvider implements Provider {
  readonly id = ID;
  readonly displayName = "nvm (Node version manager)";
  readonly installHint = pickInstallHint({
    win32:
      "Projet POSIX uniquement — sous Windows, utiliser nvm-windows : winget install CoreyButler.NVMforWindows",
    fallback: INSTALL_DOC,
  });
  // Sourcing nvm.sh in a child shell plus one GitHub call.
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (process.platform === "win32") return false;
    try {
      if (resolveNvmDir() === null) return false;
      return await commandExists("bash");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      return await scan();
    } catch {
      // A throwing provider surfaces as a scan error for the whole row; an
      // unreadable nvm is simply "nothing to report".
      return [];
    }
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    try {
      return await applyUpdate();
    } catch {
      // runner sanitisation (a control char in $NVM_DIR), a home directory the
      // OS refuses to resolve: never let it escape into the update loop.
      return failure(
        `Mise à jour de nvm impossible — mettre à jour à la main en suivant ${INSTALL_DOC}`,
      );
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update(ID)];
  }
}

/**
 * `nvm --version` prints the bare version on its own line ("0.40.6") — no
 * banner, unlike most tools here. Scan from the end so a stray warning emitted
 * while sourcing (nvm complains about a trailing slash in NVM_DIR, for
 * instance) can never be mistaken for the answer.
 */
export function parseNvmVersion(stdout: string): string | null {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const version = line.match(/^v?([0-9][\w.+-]*)$/)?.[1];
    if (version) return version;
  }
  return null;
}

/**
 * Component-wise numeric comparison of two dotted versions: negative when `a`
 * is older, 0 when equal, positive when newer. Returns null when either side is
 * not a dotted numeric version — the caller's signal to stay quiet rather than
 * guess.
 *
 * String inequality is not usable here: it orders "0.10.0" before "0.9.0", and
 * it also fires when the installed tag is *ahead* of the releases feed, which
 * would turn the upgrade into a checkout onto an older tag.
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

function numericParts(version: string): number[] | null {
  const cleaned = normalizeVersion(version);
  // eslint-disable-next-line security/detect-unsafe-regex -- fully anchored, and each repeat of the group consumes a literal "."; no two iterations can match the same input, so there is nothing to backtrack over. safe-regex false positive.
  if (!/^\d+(?:\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split(".").map(Number);
}

/**
 * The install script exports NVM_DIR, but gup can be launched from a context
 * where that export never ran (a GUI terminal spawn, a non-login shell), so the
 * documented defaults are probed too: `$XDG_CONFIG_HOME/nvm` when that variable
 * is set, `~/.nvm` otherwise — exactly the fallback chain nvm's own install
 * snippet encodes.
 */
function candidateDirs(): string[] {
  const dirs: string[] = [];
  const explicit = process.env["NVM_DIR"]?.trim();
  if (explicit) dirs.push(explicit);
  const xdg = process.env["XDG_CONFIG_HOME"]?.trim();
  if (xdg) dirs.push(posixPath.join(xdg, "nvm"));
  const home = safeHomedir();
  if (home) dirs.push(posixPath.join(home, ".nvm"));
  return dirs;
}

/** homedir() surfaces the OS error when no home can be resolved. */
function safeHomedir(): string | null {
  try {
    return homedir();
  } catch {
    return null;
  }
}

/** First candidate directory that actually holds nvm.sh, or null. */
function resolveNvmDir(): string | null {
  // posixPath, not join: this provider only ever runs off win32, and the unit
  // tests exercise it from a Windows runner where bare join emits backslashes.
  for (const dir of candidateDirs()) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe; the directory comes from the user's own $NVM_DIR / $XDG_CONFIG_HOME or homedir(), joined with a hardcoded basename. Same trust boundary as their home directory.
    if (existsSync(posixPath.join(dir, "nvm.sh"))) return dir;
  }
  return null;
}

/** Only a clone can be moved to a newer tag; anything else is manual. */
function isGitCheckout(dir: string): boolean {
  // A linked worktree stores `.git` as a file rather than a directory, and
  // existsSync accepts both.
  //
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- `dir` already passed the nvm.sh probe above; hardcoded basename, read-only.
  return existsSync(posixPath.join(dir, ".git"));
}

interface LatestRelease {
  /** Tag exactly as upstream published it — what `git checkout` is handed. */
  tag: string;
  /** Same tag without its "v", i.e. comparable with `nvm --version` output. */
  version: string;
}

/**
 * The published release, keeping the raw tag alongside the bare version.
 * Re-adding a "v" to a stripped tag would invent a ref the day upstream tags
 * without one; the checkout uses what GitHub actually returned.
 */
async function latestRelease(): Promise<LatestRelease | null> {
  const tag = await fetchGitHubReleaseLatest(REPO, { stripVPrefix: false });
  if (!tag) return null;
  const version = normalizeVersion(tag);
  return version ? { tag, version } : null;
}

/**
 * The directory travels through env vars instead of being interpolated into
 * the script body: NVM_DIR is user-controlled, and splicing it into a quoted
 * shell string would be a command-injection vector (same reasoning as the
 * PowerShell probe in containers/docker-desktop.ts). NVM_DIR is pinned to the
 * directory we actually resolved, because nvm.sh only self-detects it when it
 * is unset — an inherited NVM_DIR pointing somewhere else would otherwise
 * contradict the script being sourced. `--no-use` keeps the sourcing from
 * switching the child shell to the default Node version, which is pure
 * overhead when all we want is a version string.
 */
async function readNvmVersion(dir: string): Promise<string> {
  const { stdout, failed } = await run(
    "bash",
    ["-c", '. "$GUP_NVM_DIR/nvm.sh" --no-use >/dev/null 2>&1 && nvm --version'],
    { env: { ...process.env, GUP_NVM_DIR: dir, NVM_DIR: dir } },
  );
  return failed ? "" : stdout;
}

/** The scan proper. Split out so listOutdated is a single guarded call. */
async function scan(): Promise<OutdatedPackage[]> {
  const dir = resolveNvmDir();
  if (dir === null) return [];

  const current = parseNvmVersion(await readNvmVersion(dir));
  if (!current) return [];

  const latest = await latestRelease();
  if (!latest) return [];

  // Only a proven "installed < published" produces a row: an unparseable
  // version on either side, or a checkout already ahead of the releases feed,
  // is "no upgrade known" rather than a guess.
  const order = compareReleases(current, latest.version);
  if (order === null || order >= 0) return [];

  return [
    {
      id: ID,
      name: "nvm",
      current,
      latest: latest.version,
      note: isGitCheckout(dir)
        ? "dépôt git — checkout du tag"
        : "installation non-git — mise à jour manuelle",
    },
  ];
}

/** The update proper. Split out so update() is a single guarded call. */
async function applyUpdate(): Promise<UpdateOutcome> {
  const dir = resolveNvmDir();
  if (dir === null) {
    return failure("Installation nvm introuvable : définir NVM_DIR ou réinstaller nvm.");
  }
  if (!isGitCheckout(dir)) {
    return { id: ID, success: false, skipped: true, message: MANUAL_MESSAGE };
  }
  if (!(await commandExists("git"))) {
    return failure("git est introuvable : requis pour mettre à jour le dépôt nvm.");
  }

  const latest = await latestRelease();
  if (!latest) {
    return failure("Version la plus récente de nvm indisponible (API GitHub injoignable).");
  }
  if (await isAtLeast(dir, latest.version)) {
    return {
      id: ID,
      success: false,
      skipped: true,
      message: `nvm est déjà sur la dernière version publiée (${latest.version}) — aucun checkout.`,
    };
  }
  return checkoutTag(dir, latest.tag);
}

/**
 * True only when the installed version is provably >= `version`. An unreadable
 * or unparseable installed version answers false: the user asked for this
 * update explicitly, and refusing on "don't know" would wedge the provider.
 * What it does rule out is the one destructive case — checking out a tag older
 * than what is installed.
 */
async function isAtLeast(dir: string, version: string): Promise<boolean> {
  const current = parseNvmVersion(await readNvmVersion(dir));
  if (!current) return false;
  const order = compareReleases(current, version);
  return order !== null && order >= 0;
}

/** README manual-upgrade recipe, minus the `cd` (git -C is equivalent). */
async function checkoutTag(dir: string, tag: string): Promise<UpdateOutcome> {
  const fetched = await runInherit("git", ["-C", dir, "fetch", "--tags", "origin"]);
  if (fetched.failed) {
    return failure(`Échec de git fetch --tags origin dans ${dir}.`);
  }

  const checkout = await runInherit("git", ["-C", dir, "checkout", tag]);
  if (checkout.failed) {
    return failure(`Échec de git checkout ${tag} — modifications locales dans ${dir} ?`);
  }

  return {
    id: ID,
    success: true,
    message: `nvm mis à jour vers ${tag} — dépôt laissé en HEAD détaché sur le tag (recette officielle nvm) ; recharger le shell (source "$NVM_DIR/nvm.sh") pour activer la nouvelle version.`,
  };
}

function failure(message: string): UpdateOutcome {
  return { id: ID, success: false, message };
}
