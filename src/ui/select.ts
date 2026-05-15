import { checkbox, Separator } from "@inquirer/prompts";
import { ALL_PROVIDERS } from "../core/registry.js";
import type { OutdatedPackage, ProviderScanResult } from "../core/types.js";

export interface SelectedPackage {
  providerId: string;
  pkg: OutdatedPackage;
}

interface Choice {
  name: string;
  value: SelectedPackage;
  checked?: boolean;
}

/**
 * Inquirer checkbox grouped by provider with separators.
 * Returns the flat list of selected (providerId, pkg) tuples.
 */
export async function promptPackageSelection(
  scans: ProviderScanResult[],
): Promise<SelectedPackage[]> {
  const choices: Array<Choice | InstanceType<typeof Separator>> = [];

  const sorted = [...scans].sort((a, b) => a.providerId.localeCompare(b.providerId));
  for (const scan of sorted) {
    if (scan.packages.length === 0) continue;
    const display = ALL_PROVIDERS.find((p) => p.id === scan.providerId)?.displayName ?? scan.providerId;
    choices.push(new Separator(`── ${display} (${scan.packages.length}) ──`));
    for (const pkg of scan.packages) {
      choices.push({
        name: `${pkg.name ?? pkg.id}  ${pkg.current} → ${pkg.latest}${pkg.note ? `  [${pkg.note}]` : ""}`,
        value: { providerId: scan.providerId, pkg },
      });
    }
  }

  if (choices.length === 0) return [];

  return checkbox<SelectedPackage>({
    message: "Sélection  [espace] toggle  [a] all  [enter] valider",
    choices,
    pageSize: 20,
    loop: false,
  });
}
