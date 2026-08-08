import chalk from "chalk";
import type { ProviderScanResult } from "../core/types.js";

/**
 * État partagé du menu interactif, et les deux helpers de mise en forme qui
 * l'accompagnent.
 *
 * Ce module existe pour que `menu.ts` et `menu-options.ts` partagent le type et
 * les helpers sans s'importer mutuellement.
 */
export interface MenuState {
  scans: ProviderScanResult[];
  fast: boolean;
  filter: string[];
  detectedCount: number;
}

/** Libellé aligné sur 22 colonnes, suivi d'un indice grisé optionnel. */
export function pad(label: string, hint: string): string {
  const padded = label.padEnd(22);
  return hint ? `${padded} ${dim(hint)}` : padded;
}

export function dim(s: string): string {
  return chalk.dim(s);
}

/** Résumé lisible d'un filtre de providers — « tous » quand il est vide. */
export function describeFilter(filter: string[]): string {
  return filter.length === 0 ? "tous" : filter.join(", ");
}
