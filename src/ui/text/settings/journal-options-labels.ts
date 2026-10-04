import { localized } from "../../../core/i18n/localized.js";
import type { LogThreshold } from "../../../core/log/log.js";

/**
 * The words of the Options view's JOURNAL section, in the interface's
 * languages: its title, rows, values and hints. Period values are the
 * Journal's own (`periodLabel`). Tests import these catalogs.
 */

/** The section's title: the view's name, the same word in every language. */
export const JOURNAL_OPTIONS_TITLE = "JOURNAL";

export const JOURNAL_OPTION_LABELS = localized({
  en: {
    logLevel: "Debug log",
    period: "Journal period",
    openReport: "Open the report",
  },
  fr: {
    logLevel: "Journal de debug",
    period: "Période du journal",
    openReport: "Ouvrir le rapport",
  },
});

export const JOURNAL_OPTION_HINTS = localized({
  en: {
    logLevel: "debug for a bug report",
    period: "when the Journal opens",
    openReport: "HTML report in the browser",
    /**
     * `--log-level` or `GUP_LOG_LEVEL` set this run's level: the row applies
     * once they are gone.
     */
    overridden: (source: string, level: string) => `overridden by ${source} (${level})`,
  },
  fr: {
    logLevel: "debug pour un rapport de bug",
    period: "à l'ouverture du Journal",
    openReport: "rapport HTML dans le navigateur",
    overridden: (source, level) => `imposé par ${source} (${level})`,
  },
});

/** The levels, quietest first, as the row cycles through them. */
export const LOG_LEVEL_VALUES = localized<Readonly<Record<LogThreshold, string>>>({
  en: {
    off: "OFF",
    error: "errors",
    warn: "warnings",
    info: "info",
    debug: "debug",
    trace: "trace",
  },
  fr: {
    off: "OFF",
    error: "erreurs",
    warn: "avert.",
    info: "info",
    debug: "debug",
    trace: "trace",
  },
});
