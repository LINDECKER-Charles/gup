import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * vcpkg — Microsoft's C/C++ package manager.
 *
 * Scope: **classic mode only**, i.e. the ports installed once into the vcpkg
 * tree by `vcpkg install <port>` and then reused by every project on the
 * machine. Those behave like a global toolchain and nothing else here tracks
 * them.
 *
 * Manifest mode is deliberately out of gup's remit: a `vcpkg.json` pins its
 * dependencies per repository, so bumping them means editing a checked-in file
 * and rebuilding one project — a code change, not a machine-wide update.
 * Conveniently, `vcpkg update` refuses to run at all in manifest mode:
 * `command_update_and_exit` opens with
 * `Checks::msg_exit_with_message(VCPKG_LINE_INFO, msgUnsupportedUpdateCMD)`,
 * and `msg_exit_with_message` ends in `exit_fail` → `EXIT_FAILURE`. So the
 * `failed` guard in listOutdated already covers a user sitting in a manifest
 * directory. Outside manifest mode `vcpkg update` always ends on
 * `Checks::exit_success`, so that guard never swallows a normal scan.
 *
 * No platform gate: vcpkg ships for Windows, macOS and Linux alike, and the
 * classic-mode tree exists the same way on all three.
 *
 * Deliberately excluded beyond manifest mode: the vcpkg binary's own
 * self-update (`bootstrap-vcpkg` + `git pull` in the tree) — that upgrades the
 * *registry*, not the installed ports, and would change which versions this
 * provider reports rather than apply any of them.
 *
 * `requiresAdmin` is left unset: the documented and overwhelmingly common
 * layout is a tree cloned into the user's home, which is user-owned. A tree
 * bootstrapped under `C:\` or `/opt` would need elevation, but there is no
 * cheap reliable probe for that and guessing wrong costs the user a UAC prompt
 * on every row.
 */
export class VcpkgProvider implements Provider {
  readonly id = "vcpkg";
  readonly displayName = "vcpkg (C/C++)";
  readonly installHint = pickInstallHint({
    win32:
      "git clone https://github.com/microsoft/vcpkg puis .\\bootstrap-vcpkg.bat",
    fallback:
      "brew install vcpkg — ou git clone https://github.com/microsoft/vcpkg puis ./bootstrap-vcpkg.sh",
  });

  async isAvailable(): Promise<boolean> {
    // detectAvailableProviders() runs every isAvailable() inside a bare
    // Promise.all with no catch, so a throw here would abort detection for
    // the whole registry, not just this provider.
    try {
      return await commandExists("vcpkg");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      const { stdout, failed } = await run("vcpkg", ["update"]);
      if (failed) return [];
      return parseVcpkgUpdate(stdout);
    } catch {
      return [];
    }
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runVcpkgUpgrade([packageId]);
    return {
      id: packageId,
      success: res.success,
      ...(res.message !== undefined && { message: res.message }),
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    // Every selected spec goes into ONE `vcpkg upgrade` invocation: the tool
    // builds a single plan from them, which lets it order the rebuilds by
    // dependency and rebuild a shared dependent once instead of once per call.
    const res = await runVcpkgUpgrade(packages.map((p) => p.id));
    return packages.map((p) => ({
      id: p.id,
      success: res.success,
      ...(res.message !== undefined && { message: res.message }),
    }));
  }
}

/**
 * An upgrade is not a download: vcpkg removes the port and reinstalls it,
 * which recompiles it (and its dependents) from source. Worth saying up front
 * — a single row can mean an hour of CPU.
 */
const REBUILD_NOTE = "reconstruction depuis les sources — peut être long";

const SPAWN_FAILURE_MESSAGE = "impossible de lancer vcpkg upgrade";

/**
 * Fixed flags for every upgrade invocation.
 *
 * `--no-dry-run` is mandatory, not cosmetic: without it
 * `command_upgrade_and_exit` prints the plan, emits `msgUpgradeRunWithNoDryRun`
 * and calls `Checks::exit_fail` — nothing is ever built. The user already
 * confirmed at the gup prompt, so we pass it.
 *
 * `--no-keep-going` is what makes the exit code mean anything. vcpkg's upgrade
 * command defaults to `KeepGoing::Yes`, and `install_execute_plan` only calls
 * `Checks::exit_fail` on a build failure when keep-going is *off*; with it on,
 * a failed rebuild is merely tallied in the summary and
 * `command_upgrade_and_exit` still ends on `Checks::exit_success`. Since
 * `upgrade` **removes** each port before rebuilding it, the default would let
 * gup report a cheerful success for a port that is now simply uninstalled —
 * and record that lie in the activity history. Stopping at the first failure
 * gives a truthful non-zero instead; the pessimistic case (a batch aborted
 * midway reports every selected spec as failed) self-corrects on the next scan.
 */
const UPGRADE_FLAGS = ["upgrade", "--no-dry-run", "--no-keep-going"];

interface UpgradeResult {
  success: boolean;
  message?: string;
}

/**
 * `vcpkg upgrade` takes an unbounded list of positional specs (its
 * CommandMetadata arity is `0, SIZE_MAX`) and resolves each through
 * `check_and_get_package_spec`, which accepts the fully qualified
 * `name:triplet` form we emit as the row id. Passing them explicitly matters:
 * a *bare* `vcpkg upgrade` takes the `options.command_arguments.empty()`
 * branch and rebuilds **every** outdated port in the tree, including the ones
 * the user deliberately left unchecked.
 */
async function runVcpkgUpgrade(specs: readonly string[]): Promise<UpgradeResult> {
  try {
    const res = await runInherit("vcpkg", [...UPGRADE_FLAGS, ...specs]);
    return { success: !res.failed };
  } catch {
    // The runner rejects argv carrying control characters, and a package id
    // can reach us straight from `gup update <provider>:<id>` or from a
    // replayed history entry — never let that surface as a scan-killing throw.
    return { success: false, message: SPAWN_FAILURE_MESSAGE };
  }
}

/** Separator emitted by `VersionDiff::to_string` — `fmt::format("{} -> {}")`. */
const VERSION_ARROW = " -> ";

/** A package spec is `name:triplet`; neither half may contain a colon. */
const SPEC_PATTERN = /^[^\s:]+:[^\s:]+$/;

/**
 * `vcpkg update` prints a preamble, one row per out-of-sync port, then two
 * footer lines pointing at `upgrade` / `remove --outdated`:
 *
 *   Using local portfile versions. To update the local portfiles, use `git pull`.
 *   The following packages differ from their port versions:
 *           corrade:x64-windows              2020.06#4 -> 2020.06#5
 *           openal-soft:x64-windows          1.22.2#5 -> 1.23.0
 *   To update these packages and all dependencies, run
 *   .\vcpkg upgrade
 *
 * and a single "No packages to update." line when everything is in sync.
 *
 * Only the port rows carry the ` -> ` separator, so keying on it drops the
 * preamble, both footers and the up-to-date message without matching any
 * wording — every one of those strings goes through vcpkg's localisation table
 * (msgLocalPortfileVersion, msgPortVersionConflict, msgToUpdatePackages,
 * msgToRemovePackages, msgPackagesUpToDate), whereas the arrow is concatenated
 * by `VersionDiff::to_string` and is never translated. Same trick as
 * parsePortOutdated in providers/os/macports.ts.
 *
 * The id is the triplet-qualified spec (`zlib:x64-windows`) because that is
 * exactly what `vcpkg upgrade` accepts as a positional argument.
 */
export function parseVcpkgUpdate(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const row = parseUpdateRow(rawLine);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Split one line around the arrow rather than matching versions as `\S+`.
 * vcpkg's row format is `"\t{:<32} {}\n"`, so the left side is the spec plus
 * padding plus the current version — and a port declaring `version-string`
 * may legitimately carry spaces in that version text, which a `\S+` capture
 * would silently drop. Anchoring on the arrow and validating only the spec
 * shape keeps those rows while still rejecting any other line.
 */
function parseUpdateRow(rawLine: string): OutdatedPackage | null {
  const line = rawLine.trim();
  const arrow = line.indexOf(VERSION_ARROW);
  if (arrow < 0) return null;

  const left = line.slice(0, arrow).trim();
  const latest = line.slice(arrow + VERSION_ARROW.length).trim();
  const gap = left.search(/\s/);
  if (gap < 0 || !latest) return null;

  const id = left.slice(0, gap);
  const current = left.slice(gap).trim();
  if (!SPEC_PATTERN.test(id) || !current) return null;
  // vcpkg only lists ports whose versions differ, but a row that says
  // otherwise is noise, not an update.
  if (current === latest) return null;

  return { id, name: id, current, latest, note: REBUILD_NOTE };
}
