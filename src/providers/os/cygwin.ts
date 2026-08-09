import { existsSync } from "node:fs";
import { win32 as winPath } from "node:path";
import { isElevated, runInherit, type RunResult } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Cygwin — the POSIX environment for Windows. Windows-only by construction.
 *
 * Scope decision, and why there is no per-package row here. Cygwin ships no
 * package-manager binary of its own: `setup-x86_64.exe` is both the installer
 * and the upgrader — "Run setup-x86_64.exe any time you want to update or
 * install a Cygwin package" (cygwin.com/install.html) — and the distribution
 * never copies that executable into the tree, so it lives wherever the user
 * downloaded it. On the query side, `cygcheck -c` reports installed packages
 * with their versions and an integrity flag, but it knows nothing about what
 * the mirror carries; the "is something newer available" answer only exists in
 * the mirror's `setup.ini`, which setup downloads, verifies and parses itself.
 *
 * Producing a real current→latest diff would therefore mean re-implementing a
 * mirror client (mirror list, signature check, setup.ini parsing) inside gup,
 * and anything cheaper would be invented rather than measured. We surface a
 * single refresh-style row instead — the shape used by the WSL pacman/nix
 * providers — and let setup itself do the comparison at update time.
 *
 * Deliberately NOT covered: individual Cygwin packages (no per-package rows,
 * so no `gup update cygwin:<pkg>`), setup's own version, and the third-party
 * forks (Cygwin Portable, MSYS2 — the latter has its own pacman provider).
 *
 * `requiresAdmin` stays unset on purpose. Setup "will check by default if it
 * runs with administrative privileges and, if not, will try to elevate the
 * process" (cygwin.com/install.html — `elevate = … && !NoAdminOption &&
 * !nt_sec.isRunAsAdmin()` in setup's main.cc), and an install made with
 * `--no-admin` needs no elevation at all. Nothing in the tree tells those two
 * apart, so routing this through the CLI's UAC batch would prompt users who do
 * not need it *and* would run setup elevated against a per-user tree, leaving
 * admin-owned files behind in a directory the user normally writes unelevated.
 *
 * The price of that choice is paid in the exit status, not in the upgrade
 * itself — see {@link interpretSetupExit}, which is why success is not simply
 * `!res.failed` here.
 */
export class CygwinProvider implements Provider {
  readonly id = "cygwin";
  readonly displayName = "Cygwin";
  readonly installHint = pickInstallHint({
    win32: "https://cygwin.com/setup-x86_64.exe — lancer l'installeur puis relancer gup",
    fallback: "Cygwin est un environnement Windows — inexistant sur cette plateforme.",
  });

  async isAvailable(): Promise<boolean> {
    return findCygwinRoot(process.env) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const root = findCygwinRoot(process.env);
    if (!root) return [];
    const setup = findSetupExe(root, process.env);
    return [
      {
        id: ROW_ID,
        name: "Cygwin (paquets)",
        current: "?",
        latest: "refresh",
        // Short flag spellings of the argv built by buildUpgradeArgs — the long
        // ones would not fit the note column.
        note: setup
          ? "setup-x86_64.exe -q -g"
          : "setup-x86_64.exe introuvable — à télécharger",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const root = findCygwinRoot(process.env);
    if (!root) return deferred(NO_ROOT_MESSAGE);
    const setup = findSetupExe(root, process.env);
    if (!setup) return deferred(MISSING_SETUP_MESSAGE);
    return runSetup(setup, root);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update(ROW_ID)];
  }
}

const ROW_ID = "cygwin";
const SETUP_EXE = "setup-x86_64.exe";
const SETUP_URL = "https://cygwin.com/setup-x86_64.exe";

/** Install directories setup offers by default, most recent architecture first. */
const DEFAULT_ROOT_NAMES = ["cygwin64", "cygwin"] as const;

const CYGCHECK_RELATIVE_PATH = ["bin", "cygcheck.exe"] as const;

/**
 * Exit status of a run that finished *successfully* but had to schedule
 * in-use files for replacement at the next boot. setup ends its normal run
 * with `Logger().exit(rebootneeded ? IDS_REBOOT_REQUIRED : 0)` (main.cc) and
 * `IDS_REBOOT_REQUIRED` is the string-resource id 118 (res/resource.h), so the
 * message id doubles as the process exit code. Replacing in-use files on
 * reboot is setup's default (there is a `--no-replaceonreboot` flag to turn it
 * off), so this is a routine outcome for a Cygwin upgrade — reading it as a
 * failure would report almost every real upgrade as broken.
 */
const REBOOT_REQUIRED_EXIT = 118;

const NO_ROOT_MESSAGE =
  "Racine Cygwin introuvable — définir CYGWIN_ROOT sur le dossier d'installation.";

const MISSING_SETUP_MESSAGE =
  `${SETUP_EXE} introuvable : Cygwin ne l'installe pas dans son arborescence. ` +
  `Le télécharger sur ${SETUP_URL} puis le placer dans la racine Cygwin ou dans ` +
  `le dossier Downloads du profil utilisateur.`;

const REBOOT_MESSAGE =
  "Mise à jour appliquée ; des fichiers en cours d'utilisation seront remplacés au prochain redémarrage.";

const UNVERIFIABLE_MESSAGE =
  "setup s'est élevé via UAC : son processus parent sort toujours en 0, le " +
  "résultat réel est dans sa fenêtre et dans setup.log. Relancer gup en " +
  "administrateur pour obtenir un statut fiable.";

type Env = Record<string, string | undefined>;

/**
 * Root directories probed for a Cygwin install, in order: an explicit
 * CYGWIN_ROOT first, then the two default install paths offered by setup, on
 * the system drive before the hardcoded C: (a machine booted from another
 * letter has no C:\cygwin64 at all). Deduplicated so an explicit CYGWIN_ROOT
 * pointing at a default location does not produce the same probe twice.
 *
 * CYGWIN_ROOT is a gup convention, the counterpart of MSYS2_ROOT in the msys2
 * provider: Cygwin defines no such variable (its own `CYGWIN` variable carries
 * runtime options, and the real root lives in the registry / mount table), so
 * a tree installed somewhere exotic is only reachable if the user points us
 * at it.
 *
 * Windows paths are built with `winPath.join` rather than the platform-generic
 * `join`: these are Windows paths whatever the host running the code, and the
 * unit tests force `process.platform` to "win32" from POSIX runners where
 * `join` would emit forward slashes. The explicit separator keeps a bare drive
 * spec ("C:") from producing a drive-relative path.
 */
export function cygwinRootCandidates(env: Env): string[] {
  const roots = new Set<string>();
  const configured = normalizeRoot(env["CYGWIN_ROOT"]);
  if (configured) roots.add(configured);
  for (const drive of [env["SystemDrive"]?.trim(), "C:"]) {
    if (!drive) continue;
    for (const name of DEFAULT_ROOT_NAMES) {
      roots.add(winPath.join(drive, winPath.sep, name));
    }
  }
  return [...roots];
}

/**
 * Where the standalone installer may sit for an existing install: next to the
 * tree it manages, or still in the profile's Downloads folder (Windows keeps
 * that directory name in English on the filesystem — only its display name is
 * localised).
 *
 * Only the exact `setup-x86_64.exe` name is probed. Accepting a bare
 * `setup.exe` would widen the match to any other vendor's installer sitting in
 * Downloads, and we would then run it unattended — a rename is not worth that.
 */
export function setupExeCandidates(root: string, env: Env): string[] {
  const profile = env["USERPROFILE"]?.trim();
  return [
    winPath.join(root, SETUP_EXE),
    ...(profile ? [winPath.join(profile, "Downloads", SETUP_EXE)] : []),
  ];
}

/**
 * Unattended upgrade of every installed package. Flags as documented in the
 * Cygwin FAQ ("Does the Cygwin Setup program accept command-line arguments?"):
 *
 *   -q --quiet-mode      Unattended setup mode
 *   -g --upgrade-also    Also upgrade installed packages
 *   -n --no-shortcuts    Disable creation of desktop and start menu shortcuts
 *   -W --wait            When elevating, wait for elevated child process
 *   -R --root            Root installation directory
 *
 * `--upgrade-also` is what turns an unattended run into a full upgrade without
 * naming packages: setup's chooser computes `upgrade = wanted || … ||
 * UpgradeAlsoOption || !hasManualSelections` (choose.cc). Nothing is removed
 * along the way — the uninstall branch there is gated on `--prune-install` and
 * `--delete-orphans`, neither of which is passed.
 *
 * `--wait` keeps the parent alive until the elevated child finishes, so gup
 * does not report on an upgrade that is still running. It does *not* make the
 * exit status meaningful — see {@link interpretSetupExit}. `--no-shortcuts`
 * keeps a routine upgrade from re-creating desktop icons. `--root` pins the
 * tree we actually detected, which is not necessarily the one setup remembers
 * when CYGWIN_ROOT points elsewhere.
 *
 * No `--site`, and no invented mirror URL: setup reads its saved settings from
 * `<cwd>/setup.rc` and falls back to `cygfile:///etc/setup/setup.rc`
 * (`UserSettings::open_settings`), so on a tree we just detected the
 * `last-mirror` and `last-cache` the user chose at install time are what it
 * reuses. If that saved mirror is unusable the quiet run fails and setup's own
 * window and log say why.
 */
export function buildUpgradeArgs(root: string): string[] {
  return ["--quiet-mode", "--upgrade-also", "--no-shortcuts", "--wait", "--root", root];
}

/**
 * Decide what a finished setup run means. Split out because the answer is not
 * `!res.failed`, and because it is the one piece of logic here worth testing
 * without a Windows box.
 *
 * setup's self-elevation branch is, verbatim from main.cc:
 *
 *     if (ShellExecuteEx(&sei))
 *       { if (WaitOption && sei.hProcess != NULL)
 *           WaitForSingleObject (sei.hProcess, INFINITE); }
 *     Logger ().setExitMsg (IDS_ELEVATED);
 *     Logger ().exit (0, false);
 *
 * It never calls GetExitCodeProcess: the parent exits 0 whatever the elevated
 * child did — a declined UAC prompt included, since the `Logger().exit(0)` sits
 * outside the `if`. So a zero status only proves anything when setup did *not*
 * elevate, i.e. when gup itself was already running elevated. A non-zero status
 * is always meaningful: it can only come from the in-process branch.
 */
export function interpretSetupExit(res: RunResult, elevated: boolean): UpdateOutcome {
  // A Ctrl+C skip or a wall-clock kill is a failure whatever the exit code,
  // and it must never be laundered into the "we cannot tell" case below.
  if (res.aborted || res.timedOut) return { id: ROW_ID, success: false };
  if (res.exitCode === REBOOT_REQUIRED_EXIT) {
    return { id: ROW_ID, success: true, message: REBOOT_MESSAGE };
  }
  if (res.failed) return { id: ROW_ID, success: false };
  if (!elevated) return { id: ROW_ID, success: true, message: UNVERIFIABLE_MESSAGE };
  return { id: ROW_ID, success: true };
}

async function runSetup(setup: string, root: string): Promise<UpdateOutcome> {
  try {
    // Probed before spawning: once setup has handed off to an elevated child
    // there is nothing left to observe from the outside.
    const elevated = await isElevated();
    // Explicit cwd. setup takes its "local package directory" from
    // `GetCurrentDirectory()` (main.cc) and writes `setup.log` / the download
    // cache there when no saved `last-cache` overrides it — inheriting gup's
    // cwd would scatter those into whatever directory the user launched gup
    // from. The installer's own folder is where a double-click would put them.
    const res = await runInherit(setup, buildUpgradeArgs(root), {
      cwd: winPath.dirname(setup),
    });
    return interpretSetupExit(res, elevated);
  } catch (err) {
    // The runner refuses command names outside its path allowlist; a profile
    // directory with an accented character is the realistic trigger. Swallow
    // it into a failed outcome so one odd machine cannot break the batch.
    return {
      id: ROW_ID,
      success: false,
      message: `Lancement de ${SETUP_EXE} impossible : ${describeError(err)}`,
    };
  }
}

function findCygwinRoot(env: Env): string | null {
  // Guarded here rather than only in isAvailable(): update() reaches the
  // filesystem probes too, and a POSIX host must never match a literal
  // "C:\cygwin64\bin\cygcheck.exe" relative to the current directory.
  if (process.platform !== "win32") return null;
  try {
    // cygcheck.exe is the marker rather than the directory itself: an empty
    // C:\cygwin64 left behind by an uninstall must not count as an install.
    const found = cygwinRootCandidates(env).find((root) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe on %CYGWIN_ROOT%/%SystemDrive% joined with the hardcoded `bin\cygcheck.exe` tail; nothing is opened or written. Same shape as findPacmanExe() in msys2.ts.
      existsSync(winPath.join(root, ...CYGCHECK_RELATIVE_PATH)),
    );
    return found ?? null;
  } catch {
    // Defensive, and load-bearing precisely because isAvailable() reaches
    // here: detectAvailableProviders() awaits every provider under a single
    // Promise.all with no per-provider catch, so a TypeError thrown from this
    // path takes the detection pass for all ~130 providers down with it. The
    // realistic trigger is the same one findPacmanExe() guards against in
    // msys2.ts — an env object holding a non-string CYGWIN_ROOT/SystemDrive,
    // which `.trim()` and `winPath.join` both reject. Degrade to "no Cygwin
    // here" instead.
    return null;
  }
}

function findSetupExe(root: string, env: Env): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe over the candidate list built above from the detected root and %USERPROFILE%; nothing is opened or written.
    return setupExeCandidates(root, env).find((p) => existsSync(p)) ?? null;
  } catch {
    // Same reasoning one level down: a tree was found, so listOutdated() will
    // still emit its row — it just says setup has to be downloaded rather
    // than throwing out of the scan over a bad USERPROFILE.
    return null;
  }
}

/**
 * Trim a user-supplied root and drop trailing separators, which would
 * otherwise reach setup's `--root` argument as `C:\cygwin64\`. A bare drive
 * keeps its separator: "C:" alone is drive-*relative* on Windows and would
 * resolve against the process's per-drive current directory.
 */
function normalizeRoot(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  const stripped = trimmed.replace(/[\\/]+$/, "");
  return stripped.endsWith(":") ? `${stripped}\\` : stripped;
}

/** Nothing to run, and nothing failed either — the user has an action to take. */
function deferred(message: string): UpdateOutcome {
  return { id: ROW_ID, success: false, skipped: true, message };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
