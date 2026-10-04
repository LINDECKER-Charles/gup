import { STATUS_GLYPHS } from "../../theme/glyphs.js";

/**
 * The settings file's words (French, the language of the interface): its
 * states as `gup doctor` and the Options view show them, and the problems
 * printed once at startup. Tests import these rather than repeat them.
 */

export const CONFIG_DIAGNOSTIC_LABEL = "Configuration";

export const CONFIG_STATE_LABELS = {
  saved: `${STATUS_GLYPHS.success} enregistré`,
  defaults: "valeurs par défaut (aucun fichier)",
  disabled: "désactivé (GUP_CONFIG=0)",
  readOnly: `${STATUS_GLYPHS.warning} lecture seule (créé par une version plus récente)`,
  notSaved: (reason: string) => `${STATUS_GLYPHS.warning} non enregistré : ${reason}`,
  recovered: (backup: string) => `${STATUS_GLYPHS.warning} fichier illisible — copie : ${backup}`,
  unavailable: `${STATUS_GLYPHS.warning} emplacement indisponible`,
} as const;

export function invalidSettingsLabel(issues: readonly string[]): string {
  const ignored = `${issues.length} réglage(s) invalide(s) ignoré(s)`;
  return `${STATUS_GLYPHS.warning} ${ignored} : ${issues.join(" ; ")}`;
}

/** A filtered provider this build does not know (the filter keeps the others). */
export function unknownProviderIssue(providerId: string): string {
  return `scan.providerFilter : provider inconnu ignoré : ${providerId}`;
}

/** One problem with the settings file, as printed before any screen opens. */
export function startupIssueLine(issue: string): string {
  return `gup : configuration — ${issue}`;
}
