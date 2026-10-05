import { describe, expect, it } from "vitest";
import { dropSuperseded } from "../../src/core/superseded.js";
import type { OutdatedPackage, ProviderScanResult } from "../../src/core/types.js";

const row = (id: string): OutdatedPackage => ({ id, current: "1", latest: "2" });

function scanned(providerId: string, ids: readonly string[], error?: string): ProviderScanResult {
  return {
    providerId,
    available: true,
    packages: ids.map(row),
    ...(error !== undefined && { error }),
  };
}

/** A delegating provider's one row, its update going through `installedBy`. */
function delegated(
  providerId: string,
  installedBy?: OutdatedPackage["installedBy"],
): ProviderScanResult {
  const pkg = { ...row(providerId), ...(installedBy !== undefined && { installedBy }) };
  return { providerId, available: true, packages: [pkg] };
}

const ids = (results: readonly ProviderScanResult[], providerId: string): string[] =>
  results.find((result) => result.providerId === providerId)?.packages.map((p) => p.id) ?? [];

describe("dropSuperseded", () => {
  // A real run: visual-studio updated 18.10.2 → 18.10.3, then winget's own
  // Visual Studio row failed with "no applicable upgrade", and its retry
  // tiers offered to uninstall and reinstall Visual Studio.
  it("leaves Visual Studio to its own provider, whatever its edition and year", () => {
    const vsEditions = [
      "Microsoft.VisualStudio.Community",
      "Microsoft.VisualStudio.2022.Professional",
      "Microsoft.VisualStudio.2022.BuildTools",
      "Microsoft.VisualStudio.Enterprise.Preview",
    ];
    const winget = scanned("winget", [...vsEditions, "Microsoft.VisualStudioCode", "Git.Git"]);
    const { results, dropped } = dropSuperseded([winget, scanned("visual-studio", ["b8b8a9c2"])]);
    expect(ids(results, "winget")).toEqual(["Microsoft.VisualStudioCode", "Git.Git"]);
    expect(ids(results, "visual-studio")).toEqual(["b8b8a9c2"]);
    expect(dropped.map((d) => d.packageId)).toEqual(vsEditions);
    expect(dropped[0]).toEqual({
      providerId: "winget",
      packageId: "Microsoft.VisualStudio.Community",
      keeper: "visual-studio",
    });
  });

  it("keeps winget's Visual Studio rows when the Visual Studio provider could not scan", () => {
    const winget = scanned("winget", ["Microsoft.VisualStudio.Community"]);
    for (const others of [[], [scanned("visual-studio", [], "vswhere introuvable")]]) {
      expect(ids(dropSuperseded([winget, ...others]).results, "winget")).toEqual([
        "Microsoft.VisualStudio.Community",
      ]);
    }
  });

  it("leaves the GitHub CLI to winget when winget lists it", () => {
    const self = scanned("self", ["gh", "npm"]);
    const withWinget = dropSuperseded([self, scanned("winget", ["GitHub.cli"])]);
    expect(ids(withWinget.results, "self")).toEqual(["npm"]);
    const withoutIt = dropSuperseded([self, scanned("winget", ["Git.Git"])]);
    expect(ids(withoutIt.results, "self")).toEqual(["gh", "npm"]);
  });

  // A real run on macOS: `symfony-cli` (Homebrew's tap formula) and the
  // Symfony CLI provider's row both ran the same `brew upgrade`, and the
  // formula brew could not install failed twice.
  it("leaves a tool Homebrew installed to brew's own row", () => {
    const brew = scanned("brew", ["symfony-cli/tap/symfony-cli", "cmake"]);
    const { results, dropped } = dropSuperseded([brew, delegated("symfony-cli", "brew")]);
    expect(ids(results, "brew")).toEqual(["symfony-cli/tap/symfony-cli", "cmake"]);
    expect(ids(results, "symfony-cli")).toEqual([]);
    expect(dropped).toEqual([{ providerId: "symfony-cli", packageId: "symfony-cli", keeper: "brew" }]);
  });

  // The provider reads its latest release upstream; until the formula packages
  // it, `brew upgrade` succeeds without changing anything, run after run.
  it("drops it too when brew has no update for it", () => {
    const { results } = dropSuperseded([scanned("brew", ["cmake"]), delegated("starship", "brew")]);
    expect(ids(results, "starship")).toEqual([]);
  });

  it("keeps the tool's row when brew was not scanned or its scan failed", () => {
    const starship = delegated("starship", "brew");
    for (const others of [[], [scanned("brew", [], "brew outdated: exit 1")]]) {
      expect(ids(dropSuperseded([starship, ...others]).results, "starship")).toEqual(["starship"]);
    }
  });

  it("keeps the rows of tools another package manager installed, or none", () => {
    const others = [delegated("starship", "scoop"), delegated("pyenv", "apt"), delegated("terraform")];
    const { results, dropped } = dropSuperseded([scanned("brew", ["cmake"]), ...others]);
    expect(results.slice(1)).toEqual(others);
    expect(dropped).toEqual([]);
  });

  it("changes nothing on a scan without both providers", () => {
    const results = [scanned("npm-g", ["typescript"]), scanned("winget", ["Git.Git"])];
    expect(dropSuperseded(results)).toEqual({ results, dropped: [] });
  });
});
