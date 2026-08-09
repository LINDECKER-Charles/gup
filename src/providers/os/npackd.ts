import { commandExists, isElevated, run, runInherit } from "../../core/runner.js";
import type { RunResult } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Npackd — the third-party Windows package manager from npackd.org. Covers the
 * packages Npackd itself installed and tracks in its own SQLite catalogue;
 * nothing installed by winget/scoop/choco shows up here, and vice versa.
 *
 * Scope decisions, each forced by what the CLI actually exposes. Every claim
 * below was read off npackd-cpp master (`npackdcl/src/app.cpp`,
 * `npackd/src/dbrepository.cpp`, `npackd/src/package.cpp`), not guessed:
 *
 *  - Detection runs `ncl search --status updateable --json`. Both options are
 *    declared for `search` (`status` → "list,search", `json` →
 *    "list,list-repos,search,…"), and NpackdCL refuses any option outside a
 *    command's own allow-list, so this pairing is load-bearing. `updateable`
 *    lowers to `STATUS >= UPDATEABLE AND STATUS < NOT_INSTALLED_NOT_AVAILABLE`
 *    in DBRepository::createQuery — i.e. exactly "installed, and the catalogue
 *    holds a newer installable version". `list --status` is accepted for
 *    backwards compatibility and then ignored, so `search` is the only honest
 *    source.
 *  - Passing `--json` (or `--bare-format`) swaps the console progress reporter
 *    for a silent job, so stdout is the payload and nothing else.
 *  - `latest` is `"?"` on every row: no Npackd command prints the newest
 *    *available* version. `search --json` and `info --package X --json`
 *    (without `--version`) both serialise Package::toJSON, whose only version
 *    data is the `installed[]` array. Rather than guess, we report the gap.
 *  - The scan never refreshes the catalogue. Npackd recomputes the STATUS
 *    column while downloading repositories (`ncl detect`, or the GUI), so rows
 *    are only as fresh as the user's last refresh — the same contract as apt
 *    without `apt update`, which this codebase already accepts for wsl-apt.
 *    Running `detect` here would mutate the user's package database (it also
 *    registers MSI/control-panel entries) as a side effect of a read-only
 *    scan, which is not a trade a scanner gets to make.
 *  - App::search opens the database read-write (`openDefault()`, whose
 *    `readOnly` argument defaults to false), so on a machine where
 *    %ProgramData%\Npackd is not writable by the current user the query fails.
 *    That degrades to "no rows", never to a thrown scan.
 *  - Updates are NOT delegated to install-source.ts: Npackd owns these
 *    packages and `ncl update` is its own upgrade path.
 *
 * Deliberately out of scope: installing or removing packages, repository
 * management (`add-repo`/`set-repo`/`remove-repo`) and `detect`. gup reads,
 * then upgrades what is already there — nothing else.
 */
export class NpackdProvider implements Provider {
  readonly id = "npackd";
  readonly displayName = "Npackd";
  readonly installHint = pickInstallHint({
    win32: "https://www.npackd.org/ — installer Npackd, puis le paquet NpackdCL",
    fallback:
      "Npackd est un gestionnaire de paquets Windows — il n'existe pas sur cette plateforme.",
  });

  async isAvailable(): Promise<boolean> {
    return (await resolveNpackdBinary()) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const bin = await resolveNpackdBinary();
    if (!bin) return [];
    const rows = await scanUpdateable(bin);
    // Skip the elevation probe (a `net session` spawn) when there is nothing
    // to flag.
    if (rows.length === 0) return [];
    // Same batching rationale as Chocolatey: Npackd installs system-wide
    // unless `--local` was configured, so each upgrade needs UAC. Flagging the
    // rows lets the CLI raise one elevation prompt for the whole batch instead
    // of bouncing every package with its own SKIP. A user who moved Npackd to
    // a user-writable install dir pays one superfluous prompt; there is no
    // cheap probe for PackageUtils::globalMode to do better.
    if (await isElevatedSafe()) return rows;
    return rows.map((row) => ({ ...row, requiresAdmin: true }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const [outcome] = await applyBatch([packageId]);
    return (
      outcome ?? {
        id: packageId,
        success: false,
        skipped: true,
        message: MISSING_CLI_MESSAGE,
      }
    );
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return applyBatch(packages.map((p) => p.id));
  }
}

const NOT_ADMIN_MESSAGE =
  "Npackd installe à l'échelle du système par défaut : relancer gup depuis un terminal « Exécuter en tant qu'administrateur ».";

const MISSING_CLI_MESSAGE = "NpackdCL introuvable (ni ncl ni npackdcl dans le PATH).";

const INVALID_ID_MESSAGE =
  "Nom de paquet Npackd invalide (espace, « .. », tiret initial ou caractère de contrôle) — mise à jour à lancer à la main.";

const SPAWN_FAILED_MESSAGE = "Impossible de lancer NpackdCL pour cette mise à jour.";

/** Explains the `?` in the latest column — the CLI simply has no such field. */
const UNKNOWN_LATEST_NOTE = "version disponible non listée par ncl";

const SEARCH_JSON_ARGS = ["search", "--status", "updateable", "--json"];
const SEARCH_BARE_ARGS = ["search", "--status", "updateable", "--bare-format"];

/**
 * Since 1.19 the same binary also ships as `ncl.exe` "in order to reduce
 * typing"; `npackdcl.exe` has been in the root since version 1. Prefer the
 * short name and fall back to the historical one.
 *
 * The platform gate is load-bearing rather than decorative: `ncl` is also the
 * NCAR Command Language on Linux/macOS, so probing the bare name off Windows
 * would happily match an unrelated tool.
 */
async function resolveNpackdBinary(): Promise<string | null> {
  if (process.platform !== "win32") return null;
  for (const bin of ["ncl", "npackdcl"]) {
    if (await commandExistsSafe(bin)) return bin;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Spawn guards. core/runner.ts throws (rather than resolving) on an argv entry
// it refuses and on an unspawnable command name, and a throw escaping any of
// the four Provider methods aborts the whole scan — so every process call this
// provider makes goes through one of these.
// ---------------------------------------------------------------------------

async function commandExistsSafe(command: string): Promise<boolean> {
  try {
    return await commandExists(command);
  } catch {
    return false;
  }
}

async function runSafe(command: string, args: string[]): Promise<RunResult | null> {
  try {
    return await run(command, args);
  } catch {
    return null;
  }
}

async function runInheritSafe(
  command: string,
  args: string[],
): Promise<RunResult | null> {
  try {
    return await runInherit(command, args);
  } catch {
    return null;
  }
}

/** Conservative on error: an unknown elevation state is treated as "not admin". */
async function isElevatedSafe(): Promise<boolean> {
  try {
    return await isElevated();
  } catch {
    return false;
  }
}

/**
 * `--json` is the richer form — it is the only one carrying the installed
 * version — but nothing documents which NpackdCL release added it to `search`.
 * An older binary rejects the unknown option, exits non-zero, and would leave
 * the provider silently empty. `--bare-format` is the long-standing form, so
 * it backs the JSON path up with rows that at least name the packages waiting
 * for an upgrade instead of reporting nothing at all.
 */
async function scanUpdateable(bin: string): Promise<OutdatedPackage[]> {
  const json = await runSafe(bin, SEARCH_JSON_ARGS);
  if (json && !json.failed) return parseNpackdUpdateable(json.stdout);
  const bare = await runSafe(bin, SEARCH_BARE_ARGS);
  if (bare && !bare.failed) return parseNpackdBareSearch(bare.stdout);
  return [];
}

/**
 * One `ncl update` invocation for the whole batch: `--package` is declared
 * repeatable, so the ids are planned as a single dependency graph instead of N
 * sequential runs. Ids that fail validation are refused one by one — a single
 * bogus catalogue entry must not take the rest of the batch down with it — and
 * the input order is preserved so the caller can zip outcomes back onto rows.
 */
async function applyBatch(ids: string[]): Promise<UpdateOutcome[]> {
  const valid = ids.filter(isSafeNpackdPackageName);
  if (valid.length === 0) return ids.map((id) => invalidIdOutcome(id));
  const batch = await runNpackdUpdate(valid);
  return ids.map((id) =>
    isSafeNpackdPackageName(id) ? { id, ...batch } : invalidIdOutcome(id),
  );
}

function invalidIdOutcome(id: string): UpdateOutcome {
  return { id, success: false, skipped: true, message: INVALID_ID_MESSAGE };
}

/** Outcome shared by every id of one batch, minus the per-id `id` field. */
async function runNpackdUpdate(ids: string[]): Promise<Omit<UpdateOutcome, "id">> {
  const bin = await resolveNpackdBinary();
  if (!bin) return { success: false, skipped: true, message: MISSING_CLI_MESSAGE };
  if (!(await isElevatedSafe())) {
    return { success: false, skipped: true, message: NOT_ADMIN_MESSAGE };
  }
  const res = await runInheritSafe(bin, updateArgs(ids));
  if (!res) return { success: false, message: SPAWN_FAILED_MESSAGE };
  return { success: !res.failed };
}

/**
 * `--non-interactive` is registered without an allowed-commands list, i.e. it
 * is global and therefore legal on `update` — which matters, since NpackdCL
 * aborts with "The option --x is not allowed for the command y" otherwise.
 */
function updateArgs(ids: string[]): string[] {
  const args = ["update", "--non-interactive"];
  for (const id of ids) args.push("--package", id);
  return args;
}

/**
 * Mirrors Npackd's own `Package::isValidName` (non-empty, no space, no "..")
 * with two additions.
 *
 * A leading dash: argv never reaches a shell here, so this is not about shell
 * injection — a value starting with `-` would be read by NpackdCL's own option
 * parser as a flag rather than as the argument of `--package`, which turns a
 * bogus id into an unintended command.
 *
 * Control characters: core/runner.ts refuses them by *throwing* out of the
 * spawn, and that throw would escape update()/updateAll() and kill the batch
 * instead of skipping one row. No real Npackd package name contains one, so
 * rejecting them here is free.
 */
export function isSafeNpackdPackageName(name: string): boolean {
  if (name.length === 0 || name.startsWith("-")) return false;
  if (name.includes("..")) return false;
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  return !/\s/.test(name);
}

/**
 * `ncl search --status updateable --json` prints an indented document and
 * nothing else, since `--json` silences the progress reporter:
 *
 *   {
 *     "packages": [
 *       {
 *         "name": "com.example.App",
 *         "title": "App",
 *         "installed": [ { "version": "1.2.3", "where": "C:\\Program Files\\App" } ]
 *       }
 *     ]
 *   }
 *
 * `name`/`title` are always written by Package::toJSON; every other field,
 * `installed` included, is omitted when empty. Every listed package is by
 * construction outdated, so there is no version comparison to redo here — only
 * the installed version to extract.
 */
export function parseNpackdUpdateable(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const entry of readPackages(stdout)) {
    const row = toOutdatedRow(entry);
    if (row) out.push(row);
  }
  return out;
}

/**
 * `--bare-format` drops the "N packages found" heading and prints one
 * `<name> <title>` line per package. No version data at all, hence `current`
 * is unknown — the row still says which package Npackd wants to upgrade,
 * which is the whole point of the fallback.
 */
export function parseNpackdBareSearch(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [id, ...rest] = line.split(/\s+/);
    // Package names never contain a space, so the first token is the id; a
    // line whose first token is not a valid name is stray output, not a row.
    if (!id || !isSafeNpackdPackageName(id)) continue;
    const title = rest.join(" ").trim();
    out.push({
      id,
      name: title || id,
      current: "?",
      latest: "?",
      note: UNKNOWN_LATEST_NOTE,
    });
  }
  return out;
}

function readPackages(stdout: string): unknown[] {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  if (!("packages" in parsed)) return [];
  const packages: unknown = parsed.packages;
  return Array.isArray(packages) ? packages : [];
}

function toOutdatedRow(entry: unknown): OutdatedPackage | null {
  if (typeof entry !== "object" || entry === null || !("name" in entry)) return null;
  const id = asTrimmedString(entry.name);
  if (!id) return null;
  const title = "title" in entry ? asTrimmedString(entry.title) : "";
  const installed = "installed" in entry ? newestInstalledVersion(entry.installed) : null;
  return {
    id,
    name: title || id,
    current: installed ?? "?",
    latest: "?",
    note: UNKNOWN_LATEST_NOTE,
  };
}

/**
 * Npackd keeps every installed version of a package side by side and the JSON
 * array carries them in unspecified order, while its own "updateable" verdict
 * compares against the *newest* installed one. Pick the same reference so the
 * displayed current version matches what `ncl update` will replace.
 */
function newestInstalledVersion(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  let newest: string | null = null;
  for (const entry of value) {
    const version = readInstalledVersion(entry);
    if (!version) continue;
    if (newest === null || compareNpackdVersions(newest, version) < 0) newest = version;
  }
  return newest;
}

/** Trimmed value when the field really is a string, "" for anything else. */
function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readInstalledVersion(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null || !("version" in entry)) return null;
  const version = entry.version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

/**
 * Npackd versions are strictly dotted numbers (its `Version` type parses
 * nothing else), so a segment-wise numeric compare is exact rather than a
 * heuristic — 1.25.4 sorts above 1.9.10, which a string compare gets wrong.
 * Missing trailing segments count as 0: "1.2" precedes "1.2.1".
 */
function compareNpackdVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = Number(left[i] ?? "0");
    const y = Number(right[i] ?? "0");
    // Defensive: a non-numeric segment means the assumption above broke, so
    // fall back to a stable lexicographic order instead of NaN comparisons
    // that silently report "equal".
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
