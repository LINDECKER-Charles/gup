import { platformName } from "../../core/platform/platform-label.js";

/**
 * The words of the provider listings (French, the language of the interface):
 * `gup doctor`, and the warning a `--provider` filter gets for an id gup
 * cannot act on here. Tests import these rather than repeat them.
 */

export const DOCTOR_PROVIDER_LABELS = {
  detected: "Providers détectés",
  missing: "Non installés / hors PATH",
  incompatible: (platform: NodeJS.Platform) => `Incompatibles avec ${platformName(platform)}`,
} as const;

export const IGNORED_PROVIDER_LABELS = {
  prefix: "Attention :",
  /** `reason` is lookupProvider()'s message: an unknown id, or one foreign to this OS. */
  text: (reason: string) => `${reason} — ignoré.`,
} as const;
