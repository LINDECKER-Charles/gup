import type { ProviderScanResult } from "./types.js";

/**
 * The same software listed by two providers, kept with the one that updates
 * it properly. Updating both is never right: whichever runs second finds its
 * row stale — winget then answers "no applicable upgrade" for a Visual Studio
 * the Visual Studio provider has just updated, and its retry tiers offer to
 * uninstall and reinstall it.
 */
interface Supersession {
  /** The provider whose row goes… */
  readonly providerId: string;
  /** …for these package ids… */
  readonly packages: RegExp;
  /** …when the provider that keeps the software scanned it. */
  readonly keeper: string;
  isCovered(keeper: ProviderScanResult): boolean;
}

const SUPERSESSIONS: readonly Supersession[] = [
  // The Visual Studio provider drives the installer of every instance;
  // winget's upgrade of an edition only forwards to that same installer.
  {
    providerId: "winget",
    packages:
      /^Microsoft\.VisualStudio\.(?:\d{4}\.)?(?:Community|Professional|Enterprise|BuildTools)(?:\.Preview)?$/,
    keeper: "visual-studio",
    isCovered: (keeper) => keeper.available && keeper.error === undefined,
  },
  // A GitHub CLI winget installed lives in Program Files, where `self` sees
  // no package manager and could only say "download it yourself".
  {
    providerId: "self",
    packages: /^gh$/,
    keeper: "winget",
    isCovered: (keeper) => keeper.packages.some((pkg) => pkg.id === "GitHub.cli"),
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
  const kept = results.map((result) => {
    const rules = SUPERSESSIONS.filter(
      (rule) => rule.providerId === result.providerId && isCovered(rule, results),
    );
    if (rules.length === 0) return result;
    const packages = result.packages.filter((pkg) => {
      const rule = rules.find((candidate) => candidate.packages.test(pkg.id));
      if (rule) dropped.push({ providerId: result.providerId, packageId: pkg.id, keeper: rule.keeper });
      return rule === undefined;
    });
    return { ...result, packages };
  });
  return { results: kept, dropped };
}

function isCovered(rule: Supersession, results: readonly ProviderScanResult[]): boolean {
  const keeper = results.find((result) => result.providerId === rule.keeper);
  return keeper !== undefined && rule.isCovered(keeper);
}
