import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Fink — the oldest of the macOS ports trees, dpkg-based, installed under
 * `/sw` by default (the prefix is configurable via `basepath` in fink.conf, so
 * nothing user-facing here names it). Rare today but still maintained, and
 * completely invisible to every other provider: Fink keeps its own dpkg status
 * database, so neither Homebrew nor MacPorts ever reports a Fink package.
 *
 * Everything below was checked against Fink's own source rather than inferred:
 * `Fink::Engine::do_real_list` (the `list` implementation), the `%commands`
 * table in the same file, and `Fink::Config::parse_options`.
 *
 * Scope decision — one aggregate row, NOT one row per package. `do_real_list`
 * prints `status-flag / name / version / description`, and that lone version
 * column is `latest_version(@vers)`, i.e. the newest version fink *knows of*,
 * never the one on disk. A single cheap call therefore fills one half of the
 * pair with no way to get the other, so we report how many packages fink
 * considers out of date and name the command that fixes them — the contract
 * the WSL pacman/nix providers use. Recovering the installed version would
 * mean querying Fink's private dpkg database, which is not a cost this scan
 * should pay.
 *
 * That count is only as fresh as the local package descriptions, refreshed by
 * `fink selfupdate`. `cmd_update_all` just installs the currently-installed
 * package set at its latest known version — it never selfupdates — so the scan
 * and the update always reason about the same tree; the note says which tree.
 *
 * Deliberately excluded:
 *  - **per-package rows** (see above);
 *  - **`slow`**, on purpose. `fink list` does zero network I/O, and in steady
 *    state it loads the Storable index cache that `fink index` writes as root,
 *    so it is as quick as `brew outdated`. Only a cold or unwritable cache
 *    makes it walk the .info tree, which is why the scan carries an explicit
 *    wall-clock cap instead — `run()` has no timeout of its own, and `scanAll`
 *    has none either, so an unbounded probe here would hang the entire scan
 *    rather than just fail it.
 *
 * Every write needs root: `%commands` marks `update-all` with the root flag
 * (`list` carries 0, which is what keeps the scan password-free — fink never
 * re-execs itself under sudo for it). We pass our own `sudo` rather than let
 * `restart_as_root` do it, exactly like {@link MacPortsProvider}: fink's own
 * path dies outright when `RootMethod` is neither `sudo` nor `su`.
 * `requiresAdmin` stays unset for the same reason it does there — `isElevated()`
 * reports true on POSIX, so that batching path could never fire.
 */
export class FinkProvider implements Provider {
  readonly id = "fink";
  readonly displayName = "Fink";
  readonly installHint = pickInstallHint({
    darwin: "https://www.finkproject.org/download/",
    fallback: "macOS uniquement — https://www.finkproject.org/",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    return commandExists("fink");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run(
      "fink",
      ["list", "--tab", "--outdated"],
      { timeout: SCAN_TIMEOUT_MS },
    );
    if (failed) return [];
    const names = parseFinkOutdated(stdout);
    if (names.length === 0) return [];
    return [
      {
        id: FINK_ROW_ID,
        name: "Fink (paquets installés)",
        current: "?",
        latest: `${names.length} pkg`,
        note: "sudo fink --yes update-all — d'après le dernier fink selfupdate",
      },
    ];
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("sudo", UPDATE_ALL_ARGV);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("sudo", UPDATE_ALL_ARGV);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

/** Single stable row id: the provider aggregates the whole tree into one line. */
const FINK_ROW_ID = "fink";

/**
 * `--yes` is a *global* option (`Fink::Config::parse_options`), and
 * `Fink::Services::get_options` runs Getopt::Long under `require_order`, so
 * option parsing stops at the first non-option word. It therefore has to sit
 * before the command, per the SYNOPSIS `fink [options] command [package...]`.
 * Same reason `--tab`/`--outdated` sit *after* `list`: they belong to the
 * command's own parser.
 *
 * Caveat inherited from fink: `--yes` means "assume the *default* answer", not
 * "yes". update-all's own confirmation defaults to yes, but a prompt raised by
 * a conflicting or broken package can default to no, in which case the run
 * aborts and we report a plain failure.
 */
const UPDATE_ALL_ARGV = ["fink", "--yes", "update-all"];

/**
 * Wall-clock cap for the scan. Generous because a cold or unwritable index
 * cache makes fink stat its way through the whole .info tree, and because the
 * indexer lockfile can be held by a concurrent fink; short enough that gup
 * still finishes. `run()` passes it to execa with `reject: false`, so expiry
 * surfaces as `failed` — never as a throw.
 */
const SCAN_TIMEOUT_MS = 60_000;

/**
 * Status glyphs Fink prints in the first column, exactly the five `$iflag`
 * literals `do_real_list` can assign. `--outdated` only ever emits `(i)`, but
 * accepting the whole set keeps the parser usable against a plain `fink list`
 * dump without loosening it into "match anything".
 */
const STATUS_FLAGS = new Set(["", "i", "(i)", "*i*", "p"]);

/** Fink inherits dpkg's package-name grammar. */
const PACKAGE_NAME = /^[a-z0-9][a-z0-9+._-]*$/i;

/**
 * dpkg version. Both the optional numeric epoch and the upstream part start on
 * a digit and `:` is a legal upstream character, so one character class covers
 * `1.2.3-1` and `2:1.2.3-1` alike — no optional prefix group, which keeps the
 * pattern a single anchored class that safe-regex has nothing to say about.
 */
const PACKAGE_VERSION = /^[0-9][a-z0-9+.~:-]*$/i;

/** Width of the fixed-size status field in Fink's space-padded table mode. */
const STATUS_FIELD_WIDTH = 3;

/**
 * Parse `fink list --tab --outdated`, whose rows look like:
 *
 *   (i)\tgettext\t0.22.5-1\tMessage localization support
 *
 * Index progress and cache warnings all go through `print STDERR` /
 * `print_breaking_stderr` in `Fink::Package`, and the only `print` to stdout in
 * `do_real_list` guards the dotty formats we never ask for — so stdout carries
 * rows and nothing else. Returns the package names: the provider only needs
 * the count, but names are what makes this function worth asserting on.
 */
export function parseFinkOutdated(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const name = parseFinkListRow(line);
    if (name !== null) names.push(name);
  }
  return names;
}

/**
 * Handles both output shapes — tab-delimited (`--tab`, and fink's own fallback
 * when stdout is not a terminal) and the space-padded table.
 *
 * All three of flag, name and version are validated. Checking the flag alone
 * is not enough: the not-installed glyph is three *spaces*, so any wrapped
 * prose line that happened to reach stdout would clear it and its second word
 * would be counted as a package — turning an up-to-date machine into a phantom
 * "1 pkg" row and a pointless sudo. Requiring a dpkg-shaped version column
 * closes that.
 *
 * Caveat for callers asserting on the returned names: the padded shape formats
 * the name as `%-N.Ns` and elides anything longer to `<prefix>...`, so only the
 * tab shape (which is what the provider asks for) yields exact names.
 */
function parseFinkListRow(line: string): string | null {
  if (line.trim().length === 0) return null;
  const fields = line.includes("\t") ? line.split("\t") : splitPaddedRow(line);
  const row = readRow(fields);
  if (!row) return null;
  if (!STATUS_FLAGS.has(row.flag)) return null;
  if (!PACKAGE_NAME.test(row.name)) return null;
  return hasPlausibleVersion(row.flag, row.version) ? row.name : null;
}

interface FinkRow {
  flag: string;
  name: string;
  version: string;
}

/**
 * The three leading columns, trimmed, or null when the line did not produce
 * them. Split out of {@link parseFinkListRow} so the undefined-narrowing that
 * `noUncheckedIndexedAccess` demands does not inflate the caller's branch
 * count past the complexity ceiling.
 */
function readRow(fields: string[]): FinkRow | null {
  const [flag, name, version] = fields;
  if (flag === undefined || name === undefined || version === undefined) {
    return null;
  }
  return { flag: flag.trim(), name: name.trim(), version: version.trim() };
}

/**
 * `p` (virtual package provided by an installed one) is the single state where
 * `do_real_list` blanks the version column, so it is the single exemption. In
 * the padded shape that blank column collapses into the description, which is
 * harmless — the exemption fires before the column is read.
 */
function hasPlausibleVersion(flag: string, version: string): boolean {
  if (flag === "p") return true;
  return PACKAGE_VERSION.test(version);
}

/**
 * Table mode formats every row as `"%s  %-N.Ns  %-M.Ms  %s"`, where the status
 * flag is always exactly three characters wide, so the first split point is
 * fixed and the remaining fields are plain whitespace-separated.
 */
function splitPaddedRow(line: string): string[] {
  if (line.length <= STATUS_FIELD_WIDTH) return [];
  const rest = line.slice(STATUS_FIELD_WIDTH).trim();
  return [line.slice(0, STATUS_FIELD_WIDTH), ...rest.split(/\s+/)];
}
