import { commandExists, run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import {
  fetchGitHubReleaseTagMatching,
  normalizeVersion,
} from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

const REPO = "pkgxdev/pkgx";

/**
 * pkgx (pkgxdev/pkgx) — since v2 a package *runner*, not a package manager:
 * a standalone binary that materialises a package's dependency graph on
 * demand, executes it and keeps no classic installed set to diff against.
 *
 * The CLI has no `list` / `outdated` / `upgrade` verb. Its parser
 * (crates/cli/src/args.rs) knows exactly four modes — run, `--help`,
 * `--version`, `--query`/`-Q` — plus the `--sync`, `--shellcode`, `--json`,
 * `--chdir`, `--quiet`, `--silent` and `--shebang` flags. `-Q` is not an
 * installed list either: it answers "which package provides this program",
 * i.e. a catalogue lookup, and a catalogue never goes "outdated".
 *
 * Scope is therefore the `pkgx` binary itself, and deliberately nothing else:
 *
 *  - the packages pkgx materialises are cached versions refreshed implicitly
 *    on the next resolve. The one documented way to force them forward is
 *    `pkgx mash upgrade` (docs/faq.md, verbatim) — and `mash` runs a script
 *    fetched from a remote registry, so probing it would mean downloading and
 *    executing third-party code during what is supposed to be a read-only
 *    scan. Out of the question here, and there is no read-only counterpart:
 *    upstream documents no `mash outdated`, so there is nothing to query
 *    without also writing.
 *  - `pkgm` — the sibling tool that actually installs packages into
 *    `/usr/local` — *does* document `pkgm outdated`. But it is a separate
 *    binary, a separate repository and a separate Homebrew formula
 *    (`pkgxdev/made/pkgm`), with a `pkgm update` whose target directory
 *    depends on sudo. It deserves its own provider rather than being smuggled
 *    in behind a `pkgx` probe.
 *
 * `pkgx --version` prints `pkgx <CARGO_PKG_VERSION>` on stdout from a match arm
 * that returns before `setup()` — no pantry sync, no network — so the probe
 * stays cheap. `latest` comes from GitHub Releases, the one HTTP call that
 * makes this provider `slow`.
 *
 * That release feed needs care: upstream still ships v1 maintenance releases
 * from the pre-Rust line, and publishes them *out of order* with the v2 line
 * (v1.6.0 landed between v2.10.3 and v2.11.0). `releases/latest` returns the
 * most recently published release whatever its major, so asking it flatly
 * would have told every v2 user to "upgrade" to 1.6.0 — a downgrade row, and
 * a `brew upgrade pkgx` that does nothing. Hence: pick the newest release on
 * the *installed* major line, then emit only when it is numerically ahead.
 *
 * Walking the list has one cost worth paying attention to: `/releases` returns
 * pre-releases, which `/releases/latest` filters out for us. None exist in this
 * repo's history today, but an `-rc` tag published tomorrow would become the
 * "latest" of its line while `brew upgrade pkgx` can never install it — a row
 * that no update path clears. So pre-releases are skipped here explicitly.
 *
 * There is no self-update verb, so the upgrade is delegated to whoever owns
 * the binary on PATH — in practice Homebrew (`brew upgrade pkgx`).
 *
 * win32 is gated out: native Windows support is advertised as experimental
 * with a limited package set, and every delegation target here is POSIX.
 */
export class PkgxProvider implements Provider {
  readonly id = "pkgx";
  readonly displayName = "pkgx";
  readonly installHint = pickInstallHint({
    win32:
      "Support Windows expérimental — passer par WSL2, ou voir https://pkgx.sh",
    fallback: "brew install pkgx (ou l'installeur officiel https://pkgx.sh)",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform === "win32") return false;
    return commandExists("pkgx");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const current = await readInstalledVersion();
    if (!current) return [];

    const latest = await fetchLatestOnSameMajor(current);
    // Strictly ahead, numerically: a plain `!==` would emit a row for
    // 2.11 vs 2.11.0 (same release, two spellings) and for any out-of-order
    // release feed. Ordering is the question being asked, so ask it.
    if (!latest || compareVersions(latest, current) <= 0) return [];

    // No `manual: true` on the unowned case, unlike the sibling delegating
    // providers. Their manual shape means "download a tarball and swap the
    // binary yourself"; pkgx's official installer doubles as its upgrade path
    // ("Our installer upgrades pkgx too" — upstream FAQ), and `curl | sh` is
    // the single most common way this tool lands on a machine. Flagging it
    // manual would drop the row from every scan (scanAll filters them out) and
    // silence the majority case — showing it with a SKIP that names the exact
    // command is the actionable outcome.
    const source = await detectInstallSource("pkgx");
    return [
      {
        id: "pkgx",
        name: "pkgx",
        current,
        latest,
        note: describeSource(source),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "pkgx",
      binary: "pkgx",
      packageIds: { brew: "pkgx" },
      manualMessage:
        "Relancer l'installeur officiel, qui met aussi pkgx à jour : curl -LSsf https://pkgx.sh | sh",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("pkgx")];
  }
}

/** Installed version from `pkgx --version`, or null when the probe is useless. */
async function readInstalledVersion(): Promise<string | null> {
  const { stdout, failed } = await run("pkgx", ["--version"]);
  if (failed) return null;
  return parsePkgxVersion(stdout);
}

/**
 * Newest published release sharing `current`'s major.
 *
 * `fetchGitHubReleaseTagMatching` walks the release list (most recent first)
 * and returns the first predicate hit, so this is "latest stable on my line"
 * rather than "latest overall" — the fix for the interleaved v1/v2 feed
 * described in the file header. Returns null when that line has no stable
 * release in the window, which degrades to "no row" instead of a cross-major
 * guess. Every failure mode inside the helper (network, non-2xx, malformed
 * JSON, a body that is not an array) already resolves to null there, so
 * nothing throws out of here.
 */
async function fetchLatestOnSameMajor(current: string): Promise<string | null> {
  const major = majorOf(current);
  if (major === null) return null;
  return fetchGitHubReleaseTagMatching(
    REPO,
    (tag) => majorOf(tag) === major && !isPrerelease(tag),
  );
}

/**
 * Extract the version from `pkgx --version`, whose output is a single line:
 *
 *   pkgx 2.11.0
 *
 * (`format!("pkgx {}", env!("CARGO_PKG_VERSION"))` in crates/cli/src/main.rs.)
 *
 * The `pkgx` prefix is matched rather than skipped so a foreign binary that
 * happens to sit at that name on PATH yields null instead of a bogus row, and
 * it is anchored to the start of a line (`m` flag) so a passing mention of
 * "pkgx <number>" inside a warning cannot be mistaken for the version line.
 * The optional `v` and the loose tail keep pre-release tags (`2.12.0-rc.1`)
 * and the older v1 output shape parsable; a v1 line that turned out not to
 * start with `pkgx` simply parses as null, and the provider emits nothing.
 */
export function parsePkgxVersion(stdout: string): string | null {
  const match = stdout.match(/^\s*pkgx\s+v?([0-9][\w.+-]*)/im);
  return match?.[1] ?? null;
}

interface ParsedVersion {
  /** Dot-separated numeric core, `2.11.0` → [2, 11, 0]. */
  core: number[];
  /** True for `-rc.1`, `-beta`… which sort *below* the same core. */
  prerelease: boolean;
}

/**
 * Numeric version ordering: -1 / 0 / 1, comparing `a` to `b`.
 *
 * Missing trailing segments count as 0, so `2.11` and `2.11.0` compare equal —
 * the two spellings upstream actually uses (git tag vs Cargo version). A
 * pre-release loses to the same core without one, so an `-rc` build still sees
 * the final release as an upgrade.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const width = Math.max(left.core.length, right.core.length);
  for (let i = 0; i < width; i++) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  if (left.prerelease === right.prerelease) return 0;
  return left.prerelease ? -1 : 1;
}

/** Split a version into its numeric core and a pre-release flag. */
function parseVersion(version: string): ParsedVersion {
  // Build metadata (`2.11.0+ci7`) is stripped *before* the pre-release test,
  // not lumped in with it: semver gives it no precedence, so treating it as a
  // pre-release marker would rank a local build below the identical release
  // and emit a `2.11.0+ci7 → 2.11.0` row that no upgrade can ever clear.
  const [withoutBuild = ""] = normalizeVersion(version).split("+");
  const [core = ""] = withoutBuild.split("-");
  return {
    core: core.split(".").map(toSegment),
    prerelease: withoutBuild.length > core.length,
  };
}

/** True for `2.12.0-rc.1` and friends — a tag no delegated upgrade can reach. */
function isPrerelease(version: string): boolean {
  return parseVersion(version).prerelease;
}

/** One dotted segment as a number; anything unparsable counts as 0. */
function toSegment(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Major component of a version or a `v`-prefixed tag, null when the string
 * does not start with a number.
 *
 * Read straight off the leading digits rather than through `parseVersion`,
 * whose `toSegment` maps anything unparsable to 0: a non-version tag
 * (`nightly`, `latest`) would otherwise report major 0 and silently match a
 * `0.x` install line.
 */
function majorOf(version: string): number | null {
  const digits = normalizeVersion(version).match(/^(\d+)/)?.[1];
  return digits === undefined ? null : Number.parseInt(digits, 10);
}
