import type { LogThreshold } from "../../core/log/log.js";

/**
 * The debug log's words (French, the language of the interface): the
 * `--log-level` option, its errors, the `gup doctor` line. Tests import these
 * constants.
 */

export const LOG_LEVEL_OPTION = "niveau du journal de debug pour cette exécution";

export const LOG_MESSAGES = {
  badThreshold: (raw: string) => `niveau inconnu : ${raw} (error, warn, info, debug, trace, off)`,
} as const;

/** `gup doctor` → Système. */
export const LOG_DIAGNOSTIC_LABELS = {
  label: "Journal de debug",
  off: "désactivé",
  unavailable: "aucun dossier de journal sur cette plateforme",
  failed: (reason: string) => `non écrit — ${reason}`,
  badEnv: (raw: string) => `GUP_LOG_LEVEL ignoré (« ${raw} » n'est pas un niveau)`,
} as const;

/** Where the effective threshold came from, as `gup doctor` says it. */
export const LOG_SOURCE_LABELS = {
  flag: "--log-level",
  env: "GUP_LOG_LEVEL",
  default: "défaut",
} as const;

export function thresholdLabel(threshold: LogThreshold): string {
  return threshold === "off" ? LOG_DIAGNOSTIC_LABELS.off : threshold;
}
