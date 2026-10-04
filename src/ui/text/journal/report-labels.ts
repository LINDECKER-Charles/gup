import { localized } from "../../../core/i18n/localized.js";
import { counted, formatCount } from "../format.js";

/**
 * `gup report`'s words, in the interface's languages: command and option
 * help, messages and errors. The exported data itself (JSON, CSV) keeps
 * English field names whatever the language; the HTML report's own words
 * live with it, in `src/report/report-labels.ts`. Tests import these catalogs.
 */

export const REPORT_COMMAND_LABELS = localized({
  en: {
    report: "Exports the activity history: HTML report, JSON, CSV or text charts.",
    format: "html (default), json, csv or text",
    since: "period: 7d, 30d, 12w, 6m, 1y, all or YYYY-MM-DD (default 12m)",
    until: "end date YYYY-MM-DD (default: now)",
    out: "output file (- for standard output)",
    open: "open the HTML report in the browser (default: the Options setting)",
    noOpen: "do not open the HTML report in the browser",
    force: "overwrite the --out file if it exists",
    delimiter: "CSV separator: , ; or tab (default ,)",
  },
  fr: {
    report: "Exporte l'historique d'activité : rapport HTML, JSON, CSV ou graphiques texte.",
    format: "html (défaut), json, csv ou text",
    since: "période : 7d, 30d, 12w, 6m, 1y, all ou AAAA-MM-JJ (défaut 12m)",
    until: "date de fin AAAA-MM-JJ (défaut : maintenant)",
    out: "fichier de sortie (- pour la sortie standard)",
    open: "ouvrir le rapport HTML dans le navigateur (défaut : le réglage d'Options)",
    noOpen: "ne pas ouvrir le rapport HTML dans le navigateur",
    force: "écrase le fichier --out s'il existe",
    delimiter: "séparateur CSV : , ; ou tab (défaut ,)",
  },
});

export const REPORT_MESSAGES = localized({
  en: {
    badFormat: (raw: string) => `unknown format: ${raw} (html, json, csv or text)`,
    badSince: (raw: string) => `invalid period: ${raw} (e.g. 30d, 12m, all, 2026-01-01)`,
    badUntil: (raw: string) => `invalid end date: ${raw} (YYYY-MM-DD)`,
    untilBeforeSince: "the end date is before the start of the period",
    badDelimiter: (raw: string) => `invalid CSV separator: ${raw} (, ; or tab)`,
    written: (path: string, records: number) =>
      `  export written: ${path} (${counted(records, "record", "records")})`,
    reportWritten: (path: string) => `  report written: ${path}`,
    opened: "  opened in the default browser",
    openFailed: "  could not open the browser — open the file above",
    notHtml:
      "  opening refused: gup only opens an .html or .htm file " +
      "(another name may launch a program)",
    truncated: (kept: number) =>
      `report truncated: only the ${formatCount(kept)} most recent attempts are detailed ` +
      "(--since to narrow the period)",
    empty: (period: string) => `no activity in the period (${period})`,
    malformed: (count: number) =>
      `${counted(count, "unreadable history line", "unreadable history lines")} skipped`,
    unsupported: (count: number) =>
      `${counted(count, "line", "lines")} written by a newer gup skipped`,
  },
  fr: {
    badFormat: (raw) => `format inconnu : ${raw} (html, json, csv ou text)`,
    badSince: (raw) => `période invalide : ${raw} (ex. 30d, 12m, all, 2026-01-01)`,
    badUntil: (raw) => `date de fin invalide : ${raw} (AAAA-MM-JJ)`,
    untilBeforeSince: "la date de fin précède le début de la période",
    badDelimiter: (raw) => `séparateur CSV invalide : ${raw} (, ; ou tab)`,
    written: (path, records) =>
      `  export écrit : ${path} (${counted(records, "enregistrement", "enregistrements")})`,
    reportWritten: (path) => `  rapport écrit : ${path}`,
    opened: "  ouvert dans le navigateur par défaut",
    openFailed: "  impossible d'ouvrir le navigateur — ouvrez le fichier ci-dessus",
    notHtml:
      "  ouverture refusée : gup n'ouvre qu'un fichier .html ou .htm " +
      "(un autre nom peut lancer un programme)",
    truncated: (kept) =>
      `rapport tronqué : seules les ${formatCount(kept)} tentatives les plus récentes y sont ` +
      "détaillées (--since pour réduire la période)",
    empty: (period) => `aucune activité sur la période (${period})`,
    malformed: (count) => `${count} ligne(s) d'historique illisible(s) ignorée(s)`,
    unsupported: (count) =>
      `${count} ligne(s) écrite(s) par une version plus récente de gup ignorée(s)`,
  },
});
