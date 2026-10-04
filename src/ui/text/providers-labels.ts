import { localized } from "../../core/i18n/localized.js";
import { platformName } from "../../core/platform/platform-label.js";
import type { ProviderStatusReport } from "../../core/platform/types.js";

/**
 * The words of the provider listings, in the interface's languages: the
 * Providers view, `gup doctor`, and the warning a `--provider` filter gets
 * for an id gup cannot act on here. Tests import these rather than repeat them.
 */

export const PROVIDERS_PANEL_LABELS = localized({
  en: {
    loading: "detecting providers…",
    hints: "↑↓ scroll",
    detected: (count: number) => `Detected (${count})`,
    missing: (count: number) => `Not installed / not on PATH (${count})`,
    incompatible: (platform: NodeJS.Platform, count: number) =>
      `Incompatible with ${platformName(platform)} (${count})`,
    incompatibleNote: "Meant for another OS: gup neither detects nor updates them here.",
    summarySeparator: " · ",
    /** The parts of the panel's summary: see {@link providersSummaryParts}. */
    summary: {
      detected: (count: number) => `${count} detected`,
      missing: (count: number) => `${count} not installed`,
      incompatible: (count: number, where: string) => `${count} incompatible with ${where}`,
    },
  },
  fr: {
    loading: "détection des providers…",
    hints: "↑↓ défiler",
    detected: (count) => `Détectés (${count})`,
    missing: (count) => `Non installés / hors PATH (${count})`,
    incompatible: (platform, count) => `Incompatibles avec ${platformName(platform)} (${count})`,
    incompatibleNote: "Réservés à un autre système : gup ne les détecte ni ne les met à jour ici.",
    summarySeparator: " · ",
    summary: {
      detected: (count) => `${count} détecté(s)`,
      missing: (count) => `${count} non installé(s)`,
      incompatible: (count, where) => `${count} incompatible(s) avec ${where}`,
    },
  },
});

/**
 * The parts of the panel's summary — "38 detected", "101 not installed",
 * "14 incompatible with Windows" — the last one only when the report lists
 * incompatible providers. The panel joins them with `summarySeparator`.
 */
export function providersSummaryParts(report: ProviderStatusReport): string[] {
  const { summary } = PROVIDERS_PANEL_LABELS;
  const parts = [summary.detected(report.detected.length), summary.missing(report.missing.length)];
  if (report.incompatible.length > 0) {
    const where = platformName(report.platform);
    parts.push(summary.incompatible(report.incompatible.length, where));
  }
  return parts;
}

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
