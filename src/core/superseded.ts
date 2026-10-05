import type { OutdatedPackage, ProviderScanResult } from "./types.js";

/**
 * The same software listed by two providers, kept with the one that updates
 * it properly. Updating both is never right: whichever runs second finds its
 * row stale — winget then answers "no applicable upgrade" for a Visual Studio
 * the Visual Studio provider has just updated, and its retry tiers offer to
 * uninstall and reinstall it.
 */
interface Supersession {
  /** Whether this row of `providerId` goes… */
  drops(providerId: string, pkg: OutdatedPackage): boolean;
  /** …when the provider that keeps the software scanned it. */
  readonly keeper: string;
  isCovered(keeper: ProviderScanResult): boolean;
}

/** The keeper's scan went through, whatever it found. */
const scannedCleanly = (keeper: ProviderScanResult): boolean =>
  keeper.available && keeper.error === undefined;

const VISUAL_STUDIO_EDITION =
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested repetition: literals around one optional four-digit year
  /^Microsoft\.VisualStudio\.(?:\d{4}\.)?(?:Community|Professional|Enterprise|BuildTools)(?:\.Preview)?$/;

const SUPERSESSIONS: readonly Supersession[] = [
  // The Visual Studio provider drives the installer of every instance;
  // winget's upgrade of an edition only forwards to that same installer.
  {
    drops: (providerId, pkg) => providerId === "winget" && VISUAL_STUDIO_EDITION.test(pkg.id),
    keeper: "visual-studio",
    isCovered: scannedCleanly,
  },
  // A GitHub CLI winget installed lives in Program Files, where `self` sees
  // no package manager and could only say "download it yourself".
  {
    drops: (providerId, pkg) => providerId === "self" && pkg.id === "gh",
    keeper: "winget",
    isCovered: (keeper) => keeper.packages.some((pkg) => pkg.id === "GitHub.cli"),
  },
  // A tool Homebrew installed (Starship, Terraform, the Symfony CLI…) is
  // updated by `brew upgrade` whichever row asks for it, and `brew outdated`
  // lists what that command will do: brew's own row is the one to keep, at
  // the version the formula delivers. Both rows ran the same upgrade, so a
  // formula brew could not install failed twice. With no brew row there is
  // nothing to deliver yet — a release the tool's provider reads upstream
  // before the formula packages it — and the provider's row came back after
  // every update, a success that changed nothing.
  {
    drops: (providerId, pkg) => providerId !== "brew" && pkg.installedBy === "brew",
    keeper: "brew",
    isCovered: scannedCleanly,
  },
];

/** A row dropped because another provider keeps its software. */
export interface SupersededRow {
  readonly providerId: string;
  readonly packageId: string;
  readonly keeper: string;
}

/** The scan without the rows another provider updates, and the rows dropped. */
export function dropSuperseded(results: readonly ProviderScanResult[]): {
  readonly results: ProviderScanResult[];
  readonly dropped: SupersededRow[];
} {
  const dropped: SupersededRow[] = [];
  const rules = SUPERSESSIONS.filter((rule) => isCovered(rule, results));
  const kept = results.map((result) => {
    const packages = result.packages.filter((pkg) => {
      const rule = rules.find((candidate) => candidate.drops(result.providerId, pkg));
      if (rule) dropped.push({ providerId: result.providerId, packageId: pkg.id, keeper: rule.keeper });
      return rule === undefined;
    });
    return packages.length === result.packages.length ? result : { ...result, packages };
  });
  return { results: kept, dropped };
}

function isCovered(rule: Supersession, results: readonly ProviderScanResult[]): boolean {
  const keeper = results.find((result) => result.providerId === rule.keeper);
  return keeper !== undefined && rule.isCovered(keeper);
}
