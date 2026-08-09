import { existsSync } from "node:fs";
import { win32 as winPath } from "node:path";
import { run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * MSYS2 — the pacman package set living *inside* an MSYS2 root (msys2-runtime,
 * bash, git, and the whole `mingw-w64-*` toolchain family).
 *
 * Scope decision: winget/scoop/choco only ever know about the MSYS2 *installer*
 * (`MSYS2.MSYS2`). Upgrading that package leaves every package inside the root
 * untouched, so a machine that builds C/C++ on Windows is entirely invisible to
 * gup today. This provider covers the inside.
 *
 * Deliberately NOT covered: the installer package itself (winget already owns
 * it), the pacman set of a WSL Arch distro (see wsl-pacman), and a full
 * `pacman -Syu` system upgrade — see the update policy below.
 *
 * Detection is by absolute path rather than PATH lookup: MSYS2 does not put
 * `usr\bin` on the Windows PATH, and `pacman.exe` locates its own
 * `msys-2.0.dll` next to it, so invoking it directly from a native Windows
 * process works without going through bash. A root installed somewhere exotic
 * is reachable by setting `MSYS2_ROOT` (a gup convention — MSYS2 itself
 * defines no such variable, the same way `CYGWIN_ROOT` is one in cygwin.ts).
 *
 * Freshness caveat, and the reason there is a note on every row: `pacman -Qu`
 * compares the local package DB against the *local copy* of the sync DB, so it
 * is only as fresh as the last `-Sy`. gup will not run `-Sy` during a scan —
 * refreshing the sync DB is a mutation, and a refreshed DB with an unapplied
 * upgrade is the classic partial-upgrade footgun. Same reasoning as
 * wsl-pacman reaching for `checkupdates`; MSYS2 ships no `checkupdates`.
 *
 * Update policy: `pacman -S`, never `pacman -Syu`. Read off the MSYS2 pacman
 * fork (msys2/msys2-pacman), not guessed:
 *
 *  - `src/pacman/sync.c` routes `-Su` through `core_update()`, which — as soon
 *    as the transaction touches a *core* package — upgrades that subset alone,
 *    asks "To complete this update all MSYS2 processes including this terminal
 *    will be closed", then `execvp`s `taskkill /F` over every other MSYS2
 *    process and never reaches the full upgrade.
 *  - `src/pacman/util.c`: `yesno()` is `question(1, …)`, and `question()`
 *    returns its preset verbatim when `--noconfirm` is set. So `--noconfirm`
 *    answers *yes* to that prompt: a bulk `-Syu` would kill the user's running
 *    MSYS2 shells and builds without asking, and still exit 0 with most of the
 *    listed packages un-upgraded.
 *  - `core_update()` sits behind `if(config->op_s_upgrade)`, so a plain
 *    `-S <targets>` never enters that branch. It upgrades exactly the rows the
 *    user selected, from the very sync DB the scan read (no `-y`, so the answer
 *    cannot silently widen between listing and applying). Upstream documents
 *    the same command for the core set itself:
 *    `pacman --needed -S bash pacman pacman-mirrors msys2-runtime`.
 *
 * Core packages still matter for *reporting*: `alpm_pkg_is_core_package()`
 * (`lib/libalpm/package.c`) is bash, filesystem, mintty, msys2-runtime,
 * msys2-runtime-devel, any `msys2-runtime-*`, pacman and pacman-mirrors, and
 * MSYS2 documents that upgrading any of them means exiting and relaunching
 * every MSYS2 shell afterwards. Those rows carry a note saying so.
 *
 * `--noconfirm` also presets "%s is in IgnorePkg/IgnoreGroup. Install anyway?"
 * to yes, so an `[ignored]` row really is upgraded once the user picks it. The
 * row is kept and its note says as much, rather than being hidden.
 *
 * `requiresAdmin` stays unset on purpose. msys2.org's install folder inherits
 * the ACL of its drive, which on a default Windows install grants the
 * interactive user write access, so routing every MSYS2 row through the CLI's
 * UAC batch would prompt users who do not need it. A root created by an
 * elevated installer under another account simply fails at update time and is
 * reported as a failure.
 */
export class Msys2Provider implements Provider {
  readonly id = "msys2";
  readonly displayName = "MSYS2 (pacman)";
  readonly installHint = pickInstallHint({
    win32: "https://www.msys2.org/ — installeur officiel (racine par défaut C:\\msys64)",
    fallback: "Windows uniquement — https://www.msys2.org/",
  });

  async isAvailable(): Promise<boolean> {
    return findPacmanExe(process.env) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const pacman = findPacmanExe(process.env);
    if (!pacman) return [];
    const stdout = await queryUpgradable(pacman);
    return stdout === null ? [] : parsePacmanUpgrades(stdout);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const pacman = findPacmanExe(process.env);
    if (!pacman) return deferred(packageId, NO_ROOT_MESSAGE);
    const failure = await syncTargets(pacman, [packageId]);
    if (!failure) return { id: packageId, success: true };
    return { id: packageId, success: false, message: failure };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const pacman = findPacmanExe(process.env);
    if (!pacman) return packages.map((p) => deferred(p.id, NO_ROOT_MESSAGE));
    // One transaction for the whole selection: pacman resolves the dependency
    // set once, which is strictly safer than N sequential single-package
    // transactions leaving the root half-upgraded in between.
    const failure = await syncTargets(
      pacman,
      packages.map((p) => p.id),
    );
    return confirmUpgraded(pacman, packages, failure);
  }
}

const NO_ROOT_MESSAGE =
  "Racine MSYS2 introuvable — définir MSYS2_ROOT sur le dossier d'installation.";

const SYNC_FAILED_MESSAGE = "pacman a terminé en erreur — voir sa sortie ci-dessus.";

const STILL_PENDING_MESSAGE =
  "Toujours listé par pacman -Qu après la transaction : mise à jour non appliquée.";

const BASE_NOTE = "base locale (pas de -Sy au scan)";
const CORE_NOTE = "cœur MSYS2 : relancer les shells MSYS2 après";
const IGNORED_NOTE = "ignoré par pacman (IgnorePkg / dépôt exclu) — sera forcé";

/**
 * Mirrors `alpm_pkg_is_core_package()` in msys2/msys2-pacman
 * (`lib/libalpm/package.c`). `msys2-runtime-devel` is covered twice on purpose:
 * upstream lists it explicitly *and* matches the `msys2-runtime-` prefix.
 */
const CORE_PACKAGES = new Set([
  "bash",
  "filesystem",
  "mintty",
  "msys2-runtime",
  "msys2-runtime-devel",
  "pacman",
  "pacman-mirrors",
]);

const CORE_PREFIX = "msys2-runtime-";

const PACMAN_RELATIVE_PATH = ["usr", "bin", "pacman.exe"] as const;

type Env = Record<string, string | undefined>;

/**
 * `-Qu` prints one line per upgradable package. Format read off `display()` in
 * `src/pacman/query.c`: `"%s%s %s%s%s"` (name, installed version) then
 * `" -> %s%s%s"` (sync version), then `" %s"` with the translated `[ignored]`
 * marker:
 *
 *   msys2-runtime 3.5.4-2 -> 3.5.7-2
 *   mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1 [ignored]
 *
 * The marker is printed for an IgnorePkg/IgnoreGroup entry *or* a repository
 * whose `Usage` excludes upgrades, and it goes through `_()`, so it is matched
 * on its brackets rather than on wording that changes with the user's locale.
 *
 * No version ordering is done here: pacman already decided, with its own
 * `vercmp` (epoch:pkgver-pkgrel, where "1.10" sorts above "1.9"), that the sync
 * version is newer — re-deciding that with JavaScript string comparison is how
 * 1.10-vs-1.9 bugs get introduced. The one guard kept is equality, so a
 * malformed line can never produce a current == latest no-op row.
 */
const UPGRADE_LINE = /^(\S+)\s+(\S+)\s+->\s+(\S+)(.*)$/;

// pacman only emits colour when stdout is a TTY (both `--color auto` and the
// `Color` setting in pacman.conf gate on isatty), and we always capture through
// a pipe. Stripped anyway so the exported parser stays honest about any input a
// test — or a future forced-colour flag — feeds it.
const ANSI_SGR = /\u001b\[[0-9;]*m/g;

export function parsePacmanUpgrades(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(ANSI_SGR, "").trim();
    // Headers, `error:` lines and blanks simply do not carry the arrow.
    const m = line ? UPGRADE_LINE.exec(line) : null;
    if (!m) continue;
    // noUncheckedIndexedAccess: every capture reads as `string | undefined`.
    const [, id, current, latest, trailing] = m;
    if (!id || !current || !latest) continue;
    if (current === latest) continue;
    out.push({ id, name: id, current, latest, note: buildNote(id, trailing ?? "") });
  }
  return out;
}

function buildNote(name: string, trailing: string): string {
  const parts = [BASE_NOTE];
  if (isCorePackage(name)) parts.push(CORE_NOTE);
  if (/\[[^\]]+\]/.test(trailing)) parts.push(IGNORED_NOTE);
  return parts.join(" · ");
}

function isCorePackage(name: string): boolean {
  return CORE_PACKAGES.has(name) || name.startsWith(CORE_PREFIX);
}

/**
 * Read the local answer to "what is upgradable". Returns null when pacman could
 * not be spawned at all, which the callers must not confuse with "nothing is
 * pending" — an empty string is a real, empty answer.
 *
 * `-Qu` exits 1 both when nothing is upgradable and when no sync DB has ever
 * been downloaded, so the exit status carries no signal worth reading here;
 * only stdout does.
 */
async function queryUpgradable(pacman: string): Promise<string | null> {
  try {
    const { stdout } = await run(pacman, ["-Qu"]);
    return stdout;
  } catch {
    // The runner refuses command names outside its path allowlist; an MSYS2_ROOT
    // pointing at a profile directory with an accented character is the
    // realistic trigger. One odd machine must not break the whole scan.
    return null;
  }
}

/**
 * Upgrade `targets` in a single transaction. Returns null on success, or the
 * French reason to show the user. `--needed` keeps a target that turned out to
 * be current from being reinstalled for nothing.
 */
async function syncTargets(pacman: string, targets: string[]): Promise<string | null> {
  try {
    const res = await runInherit(pacman, ["-S", "--needed", "--noconfirm", ...targets]);
    return res.failed ? SYNC_FAILED_MESSAGE : null;
  } catch (err) {
    return `Lancement de pacman impossible : ${describeError(err)}`;
  }
}

/**
 * Attribute a batch outcome per package. The exit status alone is not enough:
 * one unresolvable target fails the whole transaction even though the others
 * were fine, and a target pacman skipped can still leave a zero exit. So ask
 * the local DB what is *still* pending and believe that instead — falling back
 * to the exit status only when the re-query itself could not run.
 */
async function confirmUpgraded(
  pacman: string,
  packages: OutdatedPackage[],
  failure: string | null,
): Promise<UpdateOutcome[]> {
  const stdout = await queryUpgradable(pacman);
  const pending =
    stdout === null ? null : new Set(parsePacmanUpgrades(stdout).map((p) => p.id));
  return packages.map((p) => {
    const stillPending = pending === null ? failure !== null : pending.has(p.id);
    if (!stillPending) return { id: p.id, success: true };
    return { id: p.id, success: false, message: failure ?? STILL_PENDING_MESSAGE };
  });
}

/** Nothing ran, and nothing failed either — the user has an action to take. */
function deferred(id: string, message: string): UpdateOutcome {
  return { id, success: false, skipped: true, message };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function findPacmanExe(env: Env): string | null {
  if (process.platform !== "win32") return null;
  try {
    const root = msys2RootCandidates(env).find((candidate) =>
      pathExists(pacmanPath(candidate)),
    );
    return root === undefined ? null : pacmanPath(root);
  } catch {
    // Defensive: `winPath.join` throws a TypeError on a non-string segment, and
    // an env object is not something this file controls.
    return null;
  }
}

function pacmanPath(root: string): string {
  return winPath.join(root, ...PACMAN_RELATIVE_PATH);
}

function pathExists(target: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe on %MSYS2_ROOT%/%SystemDrive% joined with the hardcoded `usr\bin\pacman.exe` tail; nothing is opened or written.
    return existsSync(target);
  } catch {
    return false;
  }
}

/**
 * Roots probed for an MSYS2 install, in order: an explicit `MSYS2_ROOT` first,
 * then the installer's two defaults on `%SystemDrive%` (a machine booted from
 * another letter has no `C:\msys64` at all), then the same two on a hardcoded
 * `C:`. Deduplicated through a Set so the common case where `%SystemDrive%` is
 * `C:` does not probe the same path twice.
 *
 * Paths are built with `winPath.join` rather than the platform-generic `join`:
 * these are Windows paths whatever the host running the code, and the unit
 * tests force `process.platform` to "win32" from POSIX runners where `join`
 * would emit forward slashes. The explicit `winPath.sep` between the drive and
 * the directory keeps a bare drive spec ("C:") from yielding a drive-*relative*
 * path — `C:msys64` resolves against the drive's current directory on Windows.
 */
export function msys2RootCandidates(env: Env): string[] {
  const configured = env["MSYS2_ROOT"]?.trim();
  const roots: string[] = configured ? [configured] : [];
  for (const drive of [env["SystemDrive"]?.trim(), "C:"]) {
    if (!drive) continue;
    roots.push(winPath.join(drive, winPath.sep, "msys64"));
    roots.push(winPath.join(drive, winPath.sep, "msys32"));
  }
  return [...new Set(roots)];
}
