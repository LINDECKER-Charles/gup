import type { OutdatedPackage } from "../../core/types.js";

/**
 * The interactive menu's own words (French, the language of the interface):
 * sidebar, title bar facts, key hints. Views keep their strings in their own
 * `<feature>-labels.ts`; tests import these constants rather than repeat them.
 */

export const SIDEBAR_TITLE = "Menu";
export const QUIT_LABEL = "Quitter";

export const VIEW_LABELS = {
  scan: "Scan",
  packages: "Paquets",
  providers: "Providers",
  options: "Options",
} as const;

export const SIDEBAR_HINTS = "↑↓ naviguer · entrée ouvrir · tab contenu · q quitter";
/** Appended to the focused panel's own hints. */
export const PANEL_HINTS_TAIL = "tab menu · q quitter";

export function providerCountFact(count: number): string {
  return `${count} provider(s)`;
}

export function updateCountFact(count: number): string {
  return count === 0 ? "à jour" : `${count} mise(s) à jour`;
}

export function scanModeFact(isFast: boolean, filteredProviders: number): string {
  const filter =
    filteredProviders === 0 ? "tous les providers" : `${filteredProviders} provider(s) filtrés`;
  return `${isFast ? "mode rapide" : "mode normal"} · ${filter}`;
}

export const CONFIRM_UPDATE = {
  title: "Mettre à jour",
  heading: (count: number) => `${count} paquet(s) vont être mis à jour :`,
  item: (pkg: Pick<OutdatedPackage, "id" | "name" | "current" | "latest">) =>
    `• ${pkg.name ?? pkg.id}  ${pkg.current} → ${pkg.latest}`,
  more: (count: number) => `… et ${count} autre(s)`,
} as const;

export const TIMEOUT_DIALOG = {
  title: "Timeout par install",
  text: "En secondes. Une install bloquée au-delà est ignorée ; 0 désactive le timeout.",
  invalid: "un nombre de secondes >= 0",
} as const;
