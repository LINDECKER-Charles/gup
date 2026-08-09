import { commandExists, run, runInherit } from "../../core/runner.js";
import {
  describeSource,
  detectInstallSource,
  runPmUpdate,
} from "../../core/install-source.js";
import type { InstallSource } from "../../core/install-source.js";
import { fetchGitHubReleaseLatest, normalizeVersion } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * swiftly (swiftlang/swiftly) — the official Swift toolchain installer and
 * manager. Upstream ships macOS and Linux builds only, hence the platform gate.
 *
 * Scope is the swiftly binary itself, exactly like the SDKMAN provider. The
 * Swift toolchains swiftly manages are deliberately excluded: each installed
 * toolchain would need its own `swiftly list-available <selector>` round-trip
 * against the swift.org release feed to learn whether a newer build exists —
 * one network call per toolchain, for a signal `swiftly update` recomputes on
 * its own anyway. Toolchains therefore stay with `swiftly update`, run by hand.
 *
 * Signals, all read off the 1.1.3 release tag rather than inferred:
 *  - `swiftly --version` is the flag swift-argument-parser generates from the
 *    root `CommandConfiguration(version:)`. It prints the version alone:
 *    "1.1.3", or "1.3.0-dev" for a build off the development branch, since
 *    `SwiftlyVersion.description` renders "major.minor.patch[-suffix]".
 *  - latest comes from GitHub Releases. swiftlang/swiftly tags without a "v"
 *    prefix ("1.1.3"), so the helper's strip is a no-op here.
 *
 * The update path is picked from *who owns the binary*, because `swiftly
 * self-update` refuses to run on anything it did not install: SelfUpdate.swift
 * guards on a swiftly existing in swiftly's own bin directory and otherwise
 * throws "Self update doesn't work when swiftly has been installed externally.
 * Please keep it updated from the source where you installed it in the first
 * place." A Homebrew install (formula `swiftly`) is precisely that case. So a
 * package-manager-owned binary is delegated to its manager, and only a
 * self-managed install gets `swiftly self-update`.
 *
 * No row is ever marked `manual` — every install shape has an automatic path
 * here, and a manual row would be dropped from the scan entirely.
 */
export class SwiftlyProvider implements Provider {
  readonly id = "swiftly";
  readonly displayName = "swiftly (Swift)";
  readonly installHint = pickInstallHint({
    // Le canal officiel d'abord : c'est le seul qui laisse `swiftly
    // self-update` fonctionner. La formule Homebrew existe mais range swiftly
    // hors de son propre répertoire, d'où la mise à jour déléguée à brew.
    darwin: "https://www.swift.org/install/macos/swiftly/ (ou brew install swiftly)",
    linux: "https://www.swift.org/install/linux/swiftly/",
    fallback:
      "macOS et Linux uniquement — swiftly ne cible pas Windows : https://www.swift.org/install/",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform === "win32") return false;
    try {
      return await commandExists("swiftly");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      const { stdout, failed } = await run("swiftly", ["--version"]);
      if (failed) return [];

      const current = parseSwiftlyVersion(stdout);
      if (!current) return [];

      const latest = await fetchGitHubReleaseLatest("swiftlang/swiftly");
      if (!latest || !isUpgrade(current, latest)) return [];

      const source = await detectInstallSource("swiftly");
      return [
        {
          id: PACKAGE_ID,
          name: "swiftly",
          current,
          latest,
          note: updateNote(source),
        },
      ];
    } catch {
      return [];
    }
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    try {
      const source = await detectInstallSource("swiftly");
      if (source !== "manual") {
        return await runPmUpdate(PACKAGE_ID, source, PACKAGE_IDS, EXTERNAL_MESSAGE);
      }
      return await runSelfUpdate();
    } catch {
      return {
        id: PACKAGE_ID,
        success: false,
        message: "swiftly est introuvable ou n'a pas pu être lancé.",
      };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update(PACKAGE_ID)];
  }
}

const PACKAGE_ID = "swiftly";

/**
 * Homebrew is the only package manager known to ship swiftly (formula
 * `swiftly`, homepage github.com/swiftlang/swiftly). The other ids are left
 * out on purpose: no distro packages swiftly, and there is no Windows build at
 * all — an invented id would point `apt-get install --only-upgrade` at a
 * package that does not exist. Without a matching id, runPmUpdate falls back to
 * the message below instead of running anything.
 */
const PACKAGE_IDS = { brew: "swiftly" };

const EXTERNAL_MESSAGE =
  "swiftly a été installé par un autre canal : le mettre à jour depuis cette source " +
  "(`swiftly self-update` refuse de s'exécuter sur une installation externe).";

/** Announce, in the scan row, which of the two paths update() will take. */
function updateNote(source: InstallSource): string {
  return source === "manual" ? "swiftly self-update" : describeSource(source);
}

/**
 * `--assume-yes` is a global flag (`GlobalOptions`, wired into SelfUpdate via
 * `@OptionGroup var root`), so it is accepted here and suppresses the
 * confirmation the follow-up `init` step would otherwise ask for in a
 * non-interactive run.
 *
 * The "already up to date" wording is not parsed: swiftly exits 0 in that case,
 * and the exit code is the house convention for the outcome.
 */
async function runSelfUpdate(): Promise<UpdateOutcome> {
  const res = await runInherit("swiftly", ["self-update", "--assume-yes"]);
  if (!res.failed) return { id: PACKAGE_ID, success: true };
  return { id: PACKAGE_ID, success: false, message: EXTERNAL_MESSAGE };
}

/**
 * One line, one version. Anchored per line rather than searched across the
 * whole buffer so a warning printed above the version can never donate its
 * first digit — swift-argument-parser prints the configured string alone, and
 * anything else on the line means we did not recognise the output.
 *
 * The optional "swiftly " prefix and leading "v" are tolerated in case a future
 * release decorates the line.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- fully anchored, every quantified group is either optional-once or a single character class, and the two optional tails start on disjoint characters ("." vs "-"/"+"). No nested repetition to backtrack over. safe-regex false positive.
const VERSION_LINE = /^(?:swiftly\s+)?v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)$/i;

export function parseSwiftlyVersion(stdout: string): string | null {
  for (const rawLine of stdout.split(/\r?\n/)) {
    const version = VERSION_LINE.exec(rawLine.trim())?.[1];
    if (version) return version;
  }
  return null;
}

/**
 * Compare on the numeric core, instead of the `current !== latest` shortcut
 * most providers use. swiftly's development branch advertises a version *ahead*
 * of the last tag (1.3.0-dev against a 1.1.3 release), so plain inequality
 * would invite the user to "update" down to an older build. Numeric segments
 * also keep 1.10 above 1.9, which a string comparison gets backwards.
 */
export function isUpgrade(current: string, latest: string): boolean {
  const from = numericCore(current);
  const to = numericCore(latest);
  for (let i = 0; i < Math.max(from.length, to.length); i++) {
    const a = from[i] ?? 0;
    const b = to[i] ?? 0;
    if (a !== b) return b > a;
  }
  // Identical cores: only the release supersedes the pre-release built from it.
  return hasPreReleaseSuffix(current) && !hasPreReleaseSuffix(latest);
}

function numericCore(version: string): number[] {
  const core = normalizeVersion(version).split("-")[0] ?? "";
  return core.split(".").map((segment) => {
    const n = Number.parseInt(segment, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

function hasPreReleaseSuffix(version: string): boolean {
  return normalizeVersion(version).includes("-");
}
