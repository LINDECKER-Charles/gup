import { platformName } from "../../core/platform/platform-label.js";

/**
 * The words of the provider listings (French, the language of the interface):
 * `gup doctor` so far. Tests import these rather than repeat them.
 */

export const DOCTOR_PROVIDER_LABELS = {
  detected: "Providers détectés",
  missing: "Non installés / hors PATH",
  incompatible: (platform: NodeJS.Platform) => `Incompatibles avec ${platformName(platform)}`,
} as const;
