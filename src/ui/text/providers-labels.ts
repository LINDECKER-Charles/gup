import { localized } from "../../core/i18n/localized.js";
import { platformName } from "../../core/platform/platform-label.js";
import type { ProviderStatusReport } from "../../core/platform/types.js";

/**
 * The words of the provider listings (French, the language of the interface):
 * the Providers view, `gup doctor`, and the warning a `--provider` filter gets
 * for an id gup cannot act on here. Tests import these rather than repeat them.
 */

export const PROVIDERS_PANEL_LABELS = {
  loading: "détection des providers…",
  hints: "↑↓ défiler",
  detected: (count: number) => `Détectés (${count})`,
  missing: (count: number) => `Non installés / hors PATH (${count})`,
  incompatible: (platform: NodeJS.Platform, count: number) =>
    `Incompatibles avec ${platformName(platform)} (${count})`,
  incompatibleNote: "Réservés à un autre système : gup ne les détecte ni ne les met à jour ici.",
  summarySeparator: " · ",
} as const;

/**
 * The parts of the panel's summary — "38 détecté(s)", "101 non installé(s)",
 * "14 incompatible(s) avec Windows" — the last one only when the report lists
 * incompatible providers. The panel joins them with `summarySeparator`.
 */
export function providersSummaryParts(report: ProviderStatusReport): string[] {
  const parts = [`${report.detected.length} détecté(s)`, `${report.missing.length} non installé(s)`];
  if (report.incompatible.length > 0) {
    const where = platformName(report.platform);
    parts.push(`${report.incompatible.length} incompatible(s) avec ${where}`);
  }
  return parts;
}

/** `gup doctor`'s provider groups, in the interface's languages. */
export const DOCTOR_PROVIDER_LABELS = localized({
  en: {
    detected: "Detected providers",
    missing: "Not installed / not on PATH",
    incompatible: (platform: NodeJS.Platform) => `Incompatible with ${platformName(platform)}`,
  },
  fr: {
    detected: "Providers détectés",
    missing: "Non installés / hors PATH",
    incompatible: (platform) => `Incompatibles avec ${platformName(platform)}`,
  },
});

/** The `--provider` warning of `gup update` and `gup list`, in the interface's languages. */
export const IGNORED_PROVIDER_LABELS = localized({
  en: {
    prefix: "Warning:",
    /** `reason` is lookupProvider()'s message: an unknown id, or one foreign to this OS. */
    text: (reason: string) => `${reason} — ignored.`,
  },
  fr: {
    prefix: "Attention :",
    text: (reason) => `${reason} — ignoré.`,
  },
});
