/**
 * The settings file's words (French, the language of the interface): its
 * states as `gup doctor` and the Options view show them, and the problems
 * printed once at startup. Tests import these rather than repeat them.
 */

export const CONFIG_DIAGNOSTIC_LABEL = "Configuration";

export const CONFIG_STATE_LABELS = {
  saved: "✔ enregistré",
  defaults: "valeurs par défaut (aucun fichier)",
  disabled: "désactivé (GUP_CONFIG=0)",
  readOnly: "⚠ lecture seule (créé par une version plus récente)",
  notSaved: (reason: string) => `⚠ non enregistré : ${reason}`,
  recovered: (backup: string) => `⚠ fichier illisible — copie : ${backup}`,
  unavailable: "⚠ emplacement indisponible",
} as const;

export function invalidSettingsLabel(issues: readonly string[]): string {
  return `⚠ ${issues.length} réglage(s) invalide(s) ignoré(s) : ${issues.join(" ; ")}`;
}

/** A filtered provider this build does not know (the filter keeps the others). */
export function unknownProviderIssue(providerId: string): string {
  return `scan.providerFilter : provider inconnu ignoré : ${providerId}`;
}

/** One problem with the settings file, as printed before any screen opens. */
export function startupIssueLine(issue: string): string {
  return `gup : configuration — ${issue}`;
}
