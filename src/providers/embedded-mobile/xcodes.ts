import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import type { InstallSource } from "../../core/install-source.js";
import { fetchGitHubReleaseLatest, normalizeVersion } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * xcodes (XcodesOrg/xcodes) — the Xcode version manager. macOS-only, since the
 * whole point of the tool is driving Apple's developer downloads.
 *
 * SCOPE: the `xcodes` BINARY only, never the Xcode releases it manages.
 * Installing an Xcode version is a multi-gigabyte download gated behind an
 * interactive Apple ID sign-in (and 2FA) — categorically not something an
 * "update all" may trigger. Same boundary as the pyenv-win / nvm-windows / fnm
 * providers, which also scope to the manager rather than to the runtimes.
 * `xcodes update` is deliberately NOT used here either: despite the name, its
 * documented job is "Update the list of available versions of Xcode", i.e. it
 * refreshes the catalogue, it does not upgrade the tool.
 *
 * Signals, all read off the 2.0.3 sources rather than inferred:
 *  - `xcodes version` is a real subcommand — `Xcodes.configuration` lists
 *    `Version.self` among its `subcommands`, abstract "Print the version number
 *    of xcodes itself". `Version.run()` logs `version.description` through
 *    `Logging.log`, which is `print` — a bare semver on stdout ("2.0.3"), no
 *    prefix, no decoration.
 *  - `xcodes --version` is NOT accepted: the root `CommandConfiguration`
 *    declares `abstract` / `shouldDisplay` / `subcommands` and no `version:`,
 *    so swift-argument-parser generates no such flag.
 *  - latest comes from GitHub Releases. XcodesOrg/xcodes tags without a "v"
 *    prefix ("2.0.3"), so the helper's strip is a no-op here.
 *
 * No self-update path exists, so the upgrade is delegated to whichever package
 * manager owns the binary. Homebrew ships xcodes twice — the upstream-documented
 * tap formula `xcodesorg/made/xcodes` and a homebrew/core formula also named
 * `xcodes` — and both answer to the short name, so one id covers both.
 *
 * No row is ever marked `manual`: those are dropped from the scan entirely
 * (core/registry.ts filters them out), which would hide a real, actionable
 * upgrade from anyone who installed xcodes by hand or through mint. A
 * hand-installed binary is reported as a normal row whose update() returns a
 * `skipped` outcome carrying the download instructions instead.
 */
export class XcodesProvider implements Provider {
  readonly id = "xcodes";
  readonly displayName = "xcodes (Xcode version manager)";
  readonly installHint = pickInstallHint({
    darwin: "brew install xcodesorg/made/xcodes",
    // Pas de commande d'installation hors macOS : xcodes pilote les
    // téléchargements développeur d'Apple et n'a ni build ni équivalent
    // ailleurs. Suggérer un `brew install` sur Windows ou Linux enverrait sur
    // une impasse.
    fallback:
      "macOS uniquement — xcodes ne cible pas cette plateforme : https://github.com/XcodesOrg/xcodes",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      return await commandExists("xcodes");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      const { stdout, failed } = await run("xcodes", ["version"]);
      if (failed) return [];

      const current = parseXcodesVersion(stdout);
      if (!current) return [];

      const latest = await fetchGitHubReleaseLatest("XcodesOrg/xcodes");
      if (!latest || !isXcodesUpgrade(current, latest)) return [];

      const source = await detectInstallSource("xcodes");
      return [
        { id: PACKAGE_ID, name: "xcodes", current, latest, note: updateNote(source) },
      ];
    } catch {
      return [];
    }
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    try {
      return await delegateUpdate({
        id: PACKAGE_ID,
        binary: "xcodes",
        packageIds: PACKAGE_IDS,
        manualMessage: MANUAL_MESSAGE,
      });
    } catch {
      return {
        id: PACKAGE_ID,
        success: false,
        message: "xcodes est introuvable ou la mise à jour n'a pas pu être lancée.",
      };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    // update() swallows its own failures, so nothing can escape from here.
    if (packages.length === 0) return [];
    return [await this.update(PACKAGE_ID)];
  }
}

const PACKAGE_ID = "xcodes";

/**
 * Homebrew is the only package manager that ships xcodes: the formula exists
 * both in the upstream tap (`xcodesorg/made/xcodes`) and in homebrew/core
 * (`xcodes`, same 2.0.3, same homepage), and brew resolves the short name to
 * whichever keg is actually installed. The other ids are omitted on purpose —
 * xcodes is macOS-only, so a scoop/choco/winget/apt/dnf id would necessarily be
 * invented and would point an upgrade command at a package that does not exist.
 * Without a matching id, runPmUpdate falls back to MANUAL_MESSAGE instead of
 * running anything.
 */
const PACKAGE_IDS = { brew: "xcodes" };

const MANUAL_MESSAGE =
  "Installation manuelle : télécharger la dernière version sur " +
  "https://github.com/XcodesOrg/xcodes/releases et remplacer le binaire xcodes.";

/** Announce, in the scan row, what update() will actually be able to do. */
function updateNote(source: InstallSource): string {
  return source === "manual"
    ? "installation manuelle — mise à jour à faire à la main"
    : describeSource(source);
}

/**
 * ANSI escapes should never reach us — `Version.run()` prints the raw semver,
 * and Rainbow disables itself when stdout is not a terminal, which is exactly
 * how run() spawns the child. Stripped anyway because the line match below is
 * anchored: a single stray colour code would turn a perfectly good read into a
 * silent "no version found".
 */
// eslint-disable-next-line no-control-regex -- the ESC byte is the point: this matches the SGR introducer in order to strip it.
const SGR_SEQUENCE = /\u001b\[[0-9;]*m/g;

/**
 * One line, one version. Anchored per line rather than searched across the
 * whole buffer so a first-run migration notice printed above the answer can
 * never donate its first digit — xcodes prints the version string alone, and
 * anything else on the line means we did not recognise the output.
 *
 * The core is a real dotted version rather than "any digit followed by word
 * characters": a bare `2` or a year on its own line is not a version, and
 * treating it as one would produce a bogus comparison. The optional `xcodes` /
 * `version` words and the leading `v` are tolerated in case a future release
 * decorates the line.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- safe-regex false positive (same shape as toolchain/swiftly.ts). Fully anchored, and every quantifier runs over a character class disjoint from what follows it: `\d` cannot start the `[-+]`-introduced suffix, so no input can force the engine to re-partition. Input is one trimmed line of a child process' stdout, not user data.
const VERSION_LINE = /^(?:xcodes\s+)?(?:version\s+)?v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)$/i;

/** Extract the version from `xcodes version` output. Null when unrecognised. */
export function parseXcodesVersion(stdout: string): string | null {
  for (const rawLine of stdout.split(/\r?\n/)) {
    const version = VERSION_LINE.exec(rawLine.replace(SGR_SEQUENCE, "").trim())?.[1];
    if (version) return version;
  }
  return null;
}

/**
 * Compare on the numeric core instead of the `current !== latest` shortcut.
 * Two reasons, both reachable here: `Version.swift` carries the next version as
 * a source literal, so a binary built from `main` (mint, `swift build`, a
 * HEAD formula) legitimately reports a version *ahead* of the last published
 * tag, and plain inequality would invite the user to "update" down to an older
 * build. Numeric segments also keep 2.10 above 2.9, which a string comparison
 * gets backwards.
 */
export function isXcodesUpgrade(current: string, latest: string): boolean {
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
