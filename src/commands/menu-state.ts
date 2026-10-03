import chalk from "chalk";
import type { ProviderScanResult } from "../core/types.js";

/**
 * Shared state of the interactive menu, plus the formatting helpers that go
 * with it.
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

export function dim(s: string): string {
  return chalk.dim(s);
}

/** Readable summary of a provider filter — "tous" when it is empty. */
export function describeFilter(filter: string[]): string {
  return filter.length === 0 ? "tous" : filter.join(", ");
}
