import { ALL_PROVIDERS } from "../core/registry.js";
import type { OutdatedPackage, ProviderScanResult } from "../core/types.js";
import { checkbox, type CheckboxGroup } from "./prompts/checkbox.js";

export interface SelectedPackage {
  providerId: string;
  pkg: OutdatedPackage;
}

/**
 * Package picker grouped by provider: one group per provider with updates,
 * checking a group header checks all of its packages.
 * Returns the flat list of selected (providerId, pkg) tuples.
 */
export async function promptPackageSelection(
  scans: ProviderScanResult[],
): Promise<SelectedPackage[]> {
  const groups: CheckboxGroup<SelectedPackage>[] = [...scans]
    .sort((a, b) => a.providerId.localeCompare(b.providerId))
    .filter((scan) => scan.packages.length > 0)
    .map((scan) => ({
      title: ALL_PROVIDERS.find((p) => p.id === scan.providerId)?.displayName ?? scan.providerId,
      choices: scan.packages.map((pkg) => ({
        label: pkg.name ?? pkg.id,
        hint: `${pkg.current} → ${pkg.latest}${pkg.note ? `  [${pkg.note}]` : ""}`,
        value: { providerId: scan.providerId, pkg },
      })),
    }));

  if (groups.length === 0) return [];
  return checkbox({ message: "Paquets à mettre à jour", groups });
}
