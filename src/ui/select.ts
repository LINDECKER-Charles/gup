import { getProvider } from "../core/registry.js";
import type { OutdatedPackage, ProviderScanResult } from "../core/types.js";
import { pickPackages } from "./prompts/package-picker.js";

export interface SelectedPackage {
  providerId: string;
  pkg: OutdatedPackage;
}

/**
 * Package picker for `gup update`: the outdated packages grouped by
 * provider, one checkbox each. Returns the flat list of picked
 * (providerId, pkg) tuples — empty when nothing is outdated or the user
 * leaves without picking.
 */
export async function promptPackageSelection(
  scans: ProviderScanResult[],
): Promise<SelectedPackage[]> {
  if (scans.every((scan) => scan.packages.length === 0)) return [];
  return pickPackages(scans, (id) => getProvider(id)?.displayName ?? id);
}
