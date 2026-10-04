import semver from "semver";
import { activeLocale, type Locale } from "../../core/i18n/locale.js";
import type { OutdatedPackage } from "../../core/types.js";
import type { PackageSort } from "../app/ui-preferences.js";

/** Names compared the way a reader sorts them: case and accents aside, numbers by value. */
const NAME_ORDER: Intl.CollatorOptions = { sensitivity: "base", numeric: true };
/** The collation of each interface language, as its readers expect it. */
const COLLATORS: Readonly<Record<Locale, Intl.Collator>> = {
  en: new Intl.Collator("en-US", NAME_ORDER),
  fr: new Intl.Collator("fr-FR", NAME_ORDER),
};

/** Rank of a version jump, biggest first; a jump semver cannot read comes last. */
const BUMP_RANK: Readonly<Record<string, number>> = {
  major: 0,
  premajor: 0,
  minor: 1,
  preminor: 1,
  patch: 2,
  prepatch: 2,
  prerelease: 2,
};
const UNKNOWN_BUMP = 3;

/**
 * One provider's packages in the order the user prefers: as the provider
 * listed them, A→Z by name, or by version jump (major, then minor, then
 * patch, then what semver cannot read), ties by name. Pure, but for the
 * active language: names sort the way its readers expect.
 */
export function orderPackages(
  packages: readonly OutdatedPackage[],
  sort: PackageSort,
): OutdatedPackage[] {
  if (sort === "provider") return [...packages];
  const byName = nameOrder();
  if (sort === "name") return [...packages].sort(byName);
  return [...packages].sort((a, b) => bumpRank(a) - bumpRank(b) || byName(a, b));
}

/** A→Z by name in the collation of the language active now. */
function nameOrder(): (a: OutdatedPackage, b: OutdatedPackage) => number {
  const collator = COLLATORS[activeLocale()];
  return (a, b) => collator.compare(a.name ?? a.id, b.name ?? b.id);
}

function bumpRank(pkg: OutdatedPackage): number {
  const from = semver.coerce(pkg.current);
  const to = semver.coerce(pkg.latest);
  const jump = from && to ? semver.diff(from, to) : null;
  return jump === null ? UNKNOWN_BUMP : (BUMP_RANK[jump] ?? UNKNOWN_BUMP);
}
