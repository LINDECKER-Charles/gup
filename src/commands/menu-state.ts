import type { ProviderScanResult } from "../core/types.js";
import { updateKeyOf } from "../core/update/update-plan.js";
import type { UpdateReport } from "../core/update/update-report.js";

/**
 * Shared state of the interactive menu, plus the helpers that read and prune
 * it.
 *
 * Lives apart from `menu.ts` so the UI panels can read and edit it without
 * importing the command that drives them.
 */
export interface MenuState {
  scans: ProviderScanResult[];
  fast: boolean;
  filter: string[];
  detectedCount: number;
  /** Providers found on this machine by the last scan, for the filter list. */
  providers: Array<{ id: string; displayName: string }>;
}

/** Outdated packages across every scanned provider. */
export function countPackages(scans: readonly ProviderScanResult[]): number {
  return scans.reduce((count, scan) => count + scan.packages.length, 0);
}

/**
 * The scan results without the packages `report` updated successfully: what
 * the menu shows after an update instead of rescanning everything. Failed,
 * skipped and cancelled packages stay, still outdated.
 */
export function withoutUpdated(
  scans: readonly ProviderScanResult[],
  report: UpdateReport,
): ProviderScanResult[] {
  const updated = new Set(
    report.entries.filter((entry) => entry.outcome.success).map((entry) => entry.key),
  );
  return scans.map((scan) => ({
    ...scan,
    packages: scan.packages.filter((pkg) => !updated.has(updateKeyOf(scan.providerId, pkg.id))),
  }));
}
