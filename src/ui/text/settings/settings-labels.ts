import { localized } from "../../../core/i18n/localized.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { counted } from "../format.js";

/**
 * The settings file's words, in the interface's languages: its states as
 * `gup doctor` and the Options view show them, and the problems printed once
 * at startup. The problems themselves are worded by the settings store
 * (`core/config`). Tests import these rather than repeat them.
 */

/** The same word in every language gup speaks. */
export const CONFIG_DIAGNOSTIC_LABEL = "Configuration";

export const CONFIG_STATE_LABELS = localized({
  en: {
    saved: `${STATUS_GLYPHS.success} saved`,
    defaults: "defaults (no file)",
    disabled: "disabled (GUP_CONFIG=0)",
    readOnly: `${STATUS_GLYPHS.warning} read-only (written by a newer version)`,
    notSaved: (reason: string) => `${STATUS_GLYPHS.warning} not saved: ${reason}`,
    recovered: (backup: string) => `${STATUS_GLYPHS.warning} unreadable file — backup: ${backup}`,
    unavailable: `${STATUS_GLYPHS.warning} location unavailable`,
  },
  fr: {
    saved: `${STATUS_GLYPHS.success} enregistré`,
    defaults: "valeurs par défaut (aucun fichier)",
    disabled: "désactivé (GUP_CONFIG=0)",
    readOnly: `${STATUS_GLYPHS.warning} lecture seule (créé par une version plus récente)`,
    notSaved: (reason) => `${STATUS_GLYPHS.warning} non enregistré : ${reason}`,
    recovered: (backup) => `${STATUS_GLYPHS.warning} fichier illisible — copie : ${backup}`,
    unavailable: `${STATUS_GLYPHS.warning} emplacement indisponible`,
  },
});

const ISSUE_LABELS = localized({
  en: {
    invalid: (count: number, issues: string) =>
      `${counted(count, "invalid setting", "invalid settings")} ignored: ${issues}`,
    /** Between two problems on one line. */
    separator: "; ",
    unknownProvider: (providerId: string) =>
      `scan.providerFilter: unknown provider ignored: ${providerId}`,
    startup: (issue: string) => `gup: configuration — ${issue}`,
  },
  fr: {
    invalid: (count, issues) => `${count} réglage(s) invalide(s) ignoré(s) : ${issues}`,
    separator: " ; ",
    unknownProvider: (providerId) =>
      `scan.providerFilter : provider inconnu ignoré : ${providerId}`,
    startup: (issue) => `gup : configuration — ${issue}`,
  },
});

export function invalidSettingsLabel(issues: readonly string[]): string {
  const ignored = ISSUE_LABELS.invalid(issues.length, issues.join(ISSUE_LABELS.separator));
  return `${STATUS_GLYPHS.warning} ${ignored}`;
}

/** A filtered provider this build does not know (the filter keeps the others). */
export function unknownProviderIssue(providerId: string): string {
  return ISSUE_LABELS.unknownProvider(providerId);
}

/** One problem with the settings file, as printed before any screen opens. */
export function startupIssueLine(issue: string): string {
  return ISSUE_LABELS.startup(issue);
}
