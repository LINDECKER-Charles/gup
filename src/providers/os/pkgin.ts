import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * pkgin — the binary package manager for pkgsrc: NetBSD and SmartOS/illumos
 * natively, macOS through a pkgsrc bootstrap. Nothing else in this repo sees a
 * pkgsrc prefix — `brew` owns /opt/homebrew, `port` owns /opt/local, pkgsrc
 * owns /usr/pkg or /opt/pkg — and the three coexist on the same machine.
 *
 * Every command and flag below was checked against pkgin's own source rather
 * than inferred: the `cmd[]` table in cmd.h (`list`, `install`, `upgrade`),
 * the getopt string in main.c (`"46dhyfPvVl:nc:t:p"`, so `-l`, `-y` and `-n`
 * all exist and, NetBSD getopt not permuting, must precede the command), the
 * `-l` status flags in pkgin.1.in, and `list_pkgs()` in pkglist.c.
 *
 * SCAN — why `pkgin -l "<" list` rather than the `pkgin -n upgrade` dry run.
 * `-n` ("assume no", prints the plan one action per line) does answer the
 * question, but `upgrade` is a fetching command: main() calls
 * `update_db(REMOTE_SUMMARY, 0)` for PKG_INST_CMD / PKG_UPGRD_CMD /
 * PKG_FUPGRD_CMD and, on failure, `errx(EXIT_FAILURE, MSG_DONT_HAVE_RIGHTS)`
 * — "You don't have enough rights for this operation." for anyone who is not
 * root. A scan that demands sudo is not a scan. `-l <flag> list`
 * (PKG_LLIST_CMD) never enters that branch: it is a pure query answered from
 * the local sqlite database, and `<` is documented as "The installed version
 * of the package is older than the current version".
 *
 * That listing walks the *remote* package list — `list_pkgs()` iterates
 * `r_plisthead` and prints `plist->full`, the remote full name — so it yields
 * the available version and not the installed one; the installed side comes
 * from a second plain `pkgin list` and the two are joined by package name.
 *
 * DEGRADED STATE — an empty remote catalogue. `pkgin update` needs root and
 * may never have run, and `-l "<" list` then prints nothing, which is
 * indistinguishable from "everything is current" if you only look at that one
 * call. `-l "=" list` separates them for free: it prints one line per
 * installed package that matches the catalogue exactly, so zero `<` *and* zero
 * `=` on a machine that has packages installed means the catalogue is empty,
 * not that the machine is up to date. That case degrades to a single
 * aggregate refresh row (the WSL pacman / fink pattern) instead of silently
 * reporting nothing.
 *
 * DELIBERATELY OUT OF SCOPE: pkgsrc built from source (`make update` under
 * /usr/pkgsrc) — that is pkg_chk / pkg_rolling-replace territory, with no
 * binary repository to compare against. And `pkgin stats`, which would answer
 * the catalogue question directly but only exists on recent pkgin; the `-l`
 * probe above works on every version that has `-l` at all.
 */
export class PkginProvider implements Provider {
  readonly id = "pkgin";
  readonly displayName = "pkgin (pkgsrc)";
  readonly installHint = pickInstallHint({
    win32: "pkgin fait partie de pkgsrc (NetBSD, SmartOS, macOS) — pas de portage Windows.",
    darwin:
      "Bootstrapper pkgsrc puis `pkg_add pkgin` — https://pkgsrc.smartos.org/install-on-macos/",
    fallback: "Fourni par pkgsrc — https://pkgin.net/",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform === "win32") return false;
    try {
      return await commandExists("pkgin");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    // Sequential on purpose: every invocation opens the same sqlite database,
    // and the first one may still be refreshing the local summary.
    const listing = await queryPkgin(LIST_ARGV);
    // Emptiness is checked on the raw text, not on a parsed map: pkgin prints
    // "empty local package list." to stderr and nothing at all to stdout, and
    // a machine with no pkgsrc packages has nothing worth reporting either way.
    if (listing === null || listing.trim().length === 0) return [];

    const candidates = await queryPkgin(STATUS_ARGV.lesser);
    if (candidates === null) return [];

    const rows = parsePkginOutdated(listing, candidates);
    if (rows.length > 0) return rows;
    return (await remoteCatalogueIsPopulated()) ? [] : [refreshRow()];
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    // `install` is the single-package lever — cmd.h: "Install or upgrade
    // packages" — whereas `upgrade` takes no argument. The refresh row has no
    // package behind it, so it runs the same whole-tree upgrade as updateAll:
    // as root, `upgrade` rebuilds the remote summary on its way in.
    const args =
      packageId === REFRESH_ROW_ID ? UPGRADE_ARGV : ["-y", "install", packageId];
    const success = await pkginAsRoot(args);
    return { id: packageId, success };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    let success = await pkginAsRoot(UPGRADE_ARGV);
    // WHY the second pass — `check_core_upgrade()` in actions.c: when
    // pkg_install or pkgin itself has an upgrade pending, `pkgin upgrade`
    // applies only those, prints MSG_PKGTOOLS_UPGRADED ("Package tools were
    // upgraded. Re-run \"pkgin upgrade\"…") and still returns EXIT_SUCCESS. So
    // one pass can report success having touched nothing the user asked for.
    // stdio is inherited, so that message is not ours to read — the cheap
    // unprivileged re-check below is the only gate available. Bounded to one
    // extra pass, and only when something is still pending.
    if (success && (await hasPendingUpgrades())) {
      success = await pkginAsRoot(UPGRADE_ARGV);
    }
    return packages.map((p) => ({ id: p.id, success }));
  }
}

const LIST_ARGV = ["list"];
const UPGRADE_ARGV = ["-y", "upgrade"];

/** `-l <flag> list` argv per status flag, as documented in pkgin.1.in. */
const STATUS_ARGV = {
  /** Installed version is older than the catalogue's — an upgrade is available. */
  lesser: ["-l", "<", "list"],
  /** Installed version matches the catalogue exactly. */
  equal: ["-l", "=", "list"],
} as const;

/**
 * Row id for the degraded "remote catalogue is empty" row. `:` is not a legal
 * character in a pkgsrc PKGBASE, so this can never collide with a real package
 * name — and `gup update pkgin:pkgin:refresh` still resolves, because the CLI
 * splits a target on its FIRST colon only (tests/security/update-target-parsing).
 */
const REFRESH_ROW_ID = "pkgin:refresh";

/**
 * Wall-clock cap for each scan query. `run()` has no timeout of its own and
 * `scanAll` has none either, so an unbounded probe would hang the whole scan
 * rather than just fail it. Needed here because main() refreshes the remote
 * summary — a multi-megabyte pkg_summary fetch — for *any* command, `list`
 * included, whenever the repository list changed. Expiry surfaces as `failed`
 * (execa with `reject: false`), never as a throw.
 */
const SCAN_TIMEOUT_MS = 60_000;

interface PkginEntry {
  name: string;
  version: string;
}

interface Candidate {
  version: string;
  count: number;
}

/**
 * Join the installed listing with the upgradable one, by package name.
 *
 * One repository routinely carries several builds of the same name (`php-7.4.7`
 * and `php-7.3.19` side by side), and every build that outranks the installed
 * one gets its own `<` line. Collapsing to the highest candidate matches what
 * pkgin itself resolves — `find_preferred_pkg()` keeps the entry for which
 * `version_check(best, p) == 2`, i.e. the highest — so the row shows the
 * version `pkgin install <name>` would actually pull. The one thing that can
 * still override it is a preferred.conf restriction, which the note names
 * whenever more than one candidate was seen.
 */
export function parsePkginOutdated(
  listStdout: string,
  candidatesStdout: string,
): OutdatedPackage[] {
  const installed = parsePkginList(listStdout);
  const best = new Map<string, Candidate>();
  for (const candidate of parseUpgradeCandidates(candidatesStdout)) {
    if (!installed.has(candidate.name)) continue;
    const seen = best.get(candidate.name);
    if (!seen) {
      best.set(candidate.name, { version: candidate.version, count: 1 });
      continue;
    }
    seen.count += 1;
    if (comparePkgsrcVersions(candidate.version, seen.version) > 0) {
      seen.version = candidate.version;
    }
  }
  return buildRows(installed, best);
}

/**
 * `pkgin list` prints one installed package per line as `<name>-<version>`
 * followed by its one-line comment. Returns name → installed version.
 */
export function parsePkginList(stdout: string): Map<string, string> {
  const installed = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const entry = splitFullName(tokens(line)[0]);
    if (entry) installed.set(entry.name, entry.version);
  }
  return installed;
}

/**
 * `pkgin -l "<" list` prints the available build of every installed package
 * that has a newer one, tagged with the `<` status flag. Requiring that flag
 * drops any header or diagnostic line without matching on its wording.
 */
export function parseUpgradeCandidates(stdout: string): PkginEntry[] {
  return parseStatusList(stdout, "<");
}

/** Shared body of the `-l <flag> list` parsers. */
function parseStatusList(stdout: string, flag: string): PkginEntry[] {
  const out: PkginEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const [full, status] = tokens(line);
    if (status !== flag) continue;
    const entry = splitFullName(full);
    if (entry) out.push(entry);
  }
  return out;
}

function buildRows(
  installed: Map<string, string>,
  best: Map<string, Candidate>,
): OutdatedPackage[] {
  const rows: OutdatedPackage[] = [];
  for (const [name, candidate] of best) {
    const current = installed.get(name);
    if (!current) continue;
    // Defensive: `<` already means "remote outranks local", so an equal pair
    // should be unreachable. Emitting it anyway would put a no-op line in the
    // update list, which is worse than dropping a row we cannot justify.
    if (current === candidate.version) continue;
    rows.push({
      id: name,
      name,
      current,
      latest: candidate.version,
      ...(candidate.count > 1 && {
        note: `${candidate.count} candidates — preferred.conf peut en imposer une autre`,
      }),
    });
  }
  // The `<` listing walks the remote hash table, i.e. it comes out in no order.
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Single aggregate row for the "remote catalogue never populated" state. Not
 * `manual`: scanAll drops manual rows outright, and this one is actionable —
 * `pkgin upgrade` run as root rebuilds the summary before upgrading, which is
 * exactly the fix. Same shape as the WSL pacman refresh row.
 */
function refreshRow(): OutdatedPackage {
  return {
    id: REFRESH_ROW_ID,
    name: "pkgin (catalogue distant)",
    current: "?",
    latest: "refresh",
    note: "catalogue distant vide — sudo pkgin -y upgrade le reconstruit",
  };
}

/**
 * Both output shapes collapse to the same tokens: pkgin pads the plain form
 * (`nginx-1.24.0 <    Highly performant web server`) and joins the parsable one
 * with semicolons (`nginx-1.24.0;<;Highly performant web server`). `setfmt()`
 * picks between them on `pflag`, which only `-p` sets, so a modern pkgin hands
 * us the padded form whatever gup does with stdout — the `parsable` variable
 * that main() derives from `isatty(stdout)` drives the download progress
 * meter, not the list format, and pkgin 0.9.0 explicitly stopped switching
 * output format on tty-ness ("broke various automation tools", CHANGES.md).
 * Accepting both separators is therefore belt-and-braces: it covers a
 * pre-0.9.0 pkgin and a `-p` inherited from PKGIN_ARGS.
 */
function tokens(line: string): string[] {
  return line.trim().split(/[;\s]+/);
}

/**
 * Split a pkgsrc "full" name (`mysql-server-5.6.1nb2`, `py311-setuptools-63.1.0`)
 * into name and version. pkgin applies this very rule internally —
 * `version_check()` in pkg_str.c takes `strrchr(full, '-')` — so following it
 * keeps us aligned with what the tool itself treats as a version. The extra
 * "must start with a digit" guard is ours: every pkgsrc PKGVERSION does, and it
 * costs nothing to refuse a line that is not a package at all.
 */
function splitFullName(full: string | undefined): PkginEntry | null {
  if (!full) return null;
  const dash = full.lastIndexOf("-");
  if (dash <= 0) return null;
  const version = full.slice(dash + 1);
  if (!/^\d/.test(version)) return null;
  return { name: full.slice(0, dash), version };
}

/**
 * Suffix words pkgsrc's dewey_cmp ranks *below* the bare release, so `2.0rc1`
 * loses to `2.0`. `nb` (PKGREVISION) and `pl` (patchlevel) are deliberately
 * absent: they rank above the bare release, which falls out of the comparison
 * for free since the number that follows them extends the vector.
 */
const PRERELEASE_RANK: Record<string, number> = {
  alpha: -3,
  beta: -2,
  pre: -1,
  rc: -1,
};

/**
 * Order two pkgsrc versions numerically — never by string inequality, which
 * would put 1.9 above 1.10. An approximation of dewey_cmp, not a port of it:
 * a single trailing letter (`1.0a`) carries no weight here, where pkgsrc ranks
 * it above `1.0`. That residue is tolerable because this only ever arbitrates
 * between candidates pkgin has already declared newer than the installed
 * build, so every outcome is still an upgrade.
 */
function comparePkgsrcVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** `5.6.1nb2` → [5, 6, 1, 2]; `2.0rc1` → [2, 0, -1, 1]; `2.0` → [2, 0]. */
function versionParts(version: string): number[] {
  const parts: number[] = [];
  for (const token of version.toLowerCase().match(/\d+|[a-z]+/g) ?? []) {
    if (/^\d/.test(token)) {
      parts.push(Number.parseInt(token, 10));
      continue;
    }
    const rank = PRERELEASE_RANK[token];
    if (rank !== undefined) parts.push(rank);
  }
  return parts;
}

/**
 * Run one unprivileged pkgin query. Returns its stdout, or null when the call
 * failed, timed out or could not be spawned at all — a scan must never throw,
 * and `run()` itself rejects an argv carrying control characters.
 */
async function queryPkgin(args: readonly string[]): Promise<string | null> {
  try {
    const { stdout, failed } = await run("pkgin", [...args], {
      timeout: SCAN_TIMEOUT_MS,
    });
    return failed ? null : stdout;
  } catch {
    return null;
  }
}

/**
 * True when the remote catalogue holds at least one entry matching an
 * installed package. A failed probe answers true: an older pkgin or a locked
 * database must degrade to silence, never to a false "your catalogue is empty"
 * alarm on a machine that is simply up to date.
 */
async function remoteCatalogueIsPopulated(): Promise<boolean> {
  const stdout = await queryPkgin(STATUS_ARGV.equal);
  if (stdout === null) return true;
  return parseStatusList(stdout, "=").length > 0;
}

/**
 * pkgsrc installs into a root-owned prefix and `pkgin_install()` bails out with
 * MSG_DONT_HAVE_RIGHTS unless `have_privs(PRIVS_PKGINDB | PRIVS_PKGDB)`, so
 * every write needs root. WHY the conditional prefix, where every other
 * provider here hardcodes `sudo`: sudo is absent from NetBSD base and SmartOS
 * zones are routinely entered as root, so prefixing unconditionally would fail
 * for the silly reason that sudo is missing on a box where the rights are
 * already there.
 *
 * Rows carry no `requiresAdmin`: `isElevated()` reports true on POSIX, so the
 * CLI's elevation batch — a Windows UAC affordance — would never fire. Same
 * call as MacPorts.
 *
 * Wrapped because `runInherit` validates its argv and throws on a package id
 * carrying control characters; `update()` takes that id straight from the CLI.
 */
async function pkginAsRoot(args: readonly string[]): Promise<boolean> {
  try {
    const res =
      process.getuid?.() === 0
        ? await runInherit("pkgin", [...args])
        : await runInherit("sudo", ["pkgin", ...args]);
    return !res.failed;
  } catch {
    return false;
  }
}

/** Cheap unprivileged re-check used to decide whether a second pass is needed. */
async function hasPendingUpgrades(): Promise<boolean> {
  const stdout = await queryPkgin(STATUS_ARGV.lesser);
  if (stdout === null) return false;
  return parseUpgradeCandidates(stdout).length > 0;
}
