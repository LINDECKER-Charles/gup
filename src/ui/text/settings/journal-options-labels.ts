import type { LogThreshold } from "../../../core/log/log.js";

/**
 * The words of the Options view's JOURNAL section (French, the language of
 * the interface): its title, rows, values and hints. Period values are the
 * Journal's own (`periodLabel`). Tests import these constants.
 */

export const JOURNAL_OPTIONS_TITLE = "JOURNAL";

export const JOURNAL_OPTION_LABELS = {
  logLevel: "Journal de debug",
  period: "Période du journal",
  openReport: "Ouvrir le rapport",
} as const;

export const JOURNAL_OPTION_HINTS = {
  logLevel: "debug pour un rapport de bug",
  period: "à l'ouverture du Journal",
  openReport: "rapport HTML dans le navigateur",
  /** `--log-level` or `GUP_LOG_LEVEL` set this run's level: the row applies once they are gone. */
  overridden: (source: string, level: string) => `imposé par ${source} (${level})`,
} as const;

/** The levels, quietest first, as the row cycles through them. */
export const LOG_LEVEL_VALUES: Readonly<Record<LogThreshold, string>> = {
  off: "OFF",
  error: "erreurs",
  warn: "avert.",
  info: "info",
  debug: "debug",
  trace: "trace",
};
