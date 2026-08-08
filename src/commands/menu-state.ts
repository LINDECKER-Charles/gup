import chalk from "chalk";
import type { ProviderScanResult } from "../core/types.js";

/**
 * Shared state of the interactive menu, plus the two formatting helpers that
 * go with it.
 *
 * This module exists so `menu.ts` and `menu-options.ts` can share the type and
 * the helpers without importing each other.
 */
export interface MenuState {
  scans: ProviderScanResult[];
  fast: boolean;
  filter: string[];
  detectedCount: number;
}

/** Label padded to 22 columns, followed by an optional dimmed hint. */
export function pad(label: string, hint: string): string {
  const padded = label.padEnd(22);
  return hint ? `${padded} ${dim(hint)}` : padded;
}

export function dim(s: string): string {
  return chalk.dim(s);
}

/** Readable summary of a provider filter — "tous" when it is empty. */
export function describeFilter(filter: string[]): string {
  return filter.length === 0 ? "tous" : filter.join(", ");
}
