import semver from "semver";
import type { OutdatedPackage } from "../../core/types.js";
import type { PackageSort } from "../app/ui-preferences.js";

/** Names compared the way a French reader sorts them: case and accents aside, numbers by value. */
const NAMES = new Intl.Collator("fr-FR", { sensitivity: "base", numeric: true });

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
 * patch, then what semver cannot read), ties by name. Pure.
 */
export function orderPackages(
  packages: readonly OutdatedPackage[],
  sort: PackageSort,
): OutdatedPackage[] {
  if (sort === "provider") return [...packages];
  if (sort === "name") return [...packages].sort(byName);
  return [...packages].sort((a, b) => bumpRank(a) - bumpRank(b) || byName(a, b));
}

function byName(a: OutdatedPackage, b: OutdatedPackage): number {
  return NAMES.compare(a.name ?? a.id, b.name ?? b.id);
}

function bumpRank(pkg: OutdatedPackage): number {
  const from = semver.coerce(pkg.current);
  const to = semver.coerce(pkg.latest);
  const jump = from && to ? semver.diff(from, to) : null;
  return jump === null ? UNKNOWN_BUMP : (BUMP_RANK[jump] ?? UNKNOWN_BUMP);
}
