import { counted, formatCount } from "../format.js";

/**
 * `gup report`'s words (French, the language of the interface): command and
 * option help, messages and errors. The exported data itself (JSON, CSV)
 * keeps English field names; the HTML report's own words live with it, in
 * `src/report/report-labels.ts`. Tests import these constants.
 */

export const REPORT_COMMAND_LABELS = {
  report: "Exporte l'historique d'activité : rapport HTML, JSON, CSV ou graphiques texte.",
  format: "html (défaut), json, csv ou text",
  since: "période : 7d, 30d, 12w, 6m, 1y, all ou AAAA-MM-JJ (défaut 12m)",
  until: "date de fin AAAA-MM-JJ (défaut : maintenant)",
  out: "fichier de sortie (- pour la sortie standard)",
  open: "ouvrir le rapport HTML dans le navigateur (défaut : le réglage d'Options)",
  noOpen: "ne pas ouvrir le rapport HTML dans le navigateur",
  force: "écrase le fichier --out s'il existe",
  delimiter: "séparateur CSV : , ; ou tab (défaut ,)",
} as const;

export const REPORT_MESSAGES = {
  badFormat: (raw: string) => `format inconnu : ${raw} (html, json, csv ou text)`,
  badSince: (raw: string) => `période invalide : ${raw} (ex. 30d, 12m, all, 2026-01-01)`,
  badUntil: (raw: string) => `date de fin invalide : ${raw} (AAAA-MM-JJ)`,
  untilBeforeSince: "la date de fin précède le début de la période",
  badDelimiter: (raw: string) => `séparateur CSV invalide : ${raw} (, ; ou tab)`,
  written: (path: string, records: number) =>
    `  export écrit : ${path} (${counted(records, "enregistrement", "enregistrements")})`,
  reportWritten: (path: string) => `  rapport écrit : ${path}`,
  opened: "  ouvert dans le navigateur par défaut",
  openFailed: "  impossible d'ouvrir le navigateur — ouvrez le fichier ci-dessus",
  notHtml:
    "  ouverture refusée : gup n'ouvre qu'un fichier .html ou .htm " +
    "(un autre nom peut lancer un programme)",
  truncated: (kept: number) =>
    `rapport tronqué : seules les ${formatCount(kept)} tentatives les plus récentes y sont ` +
    "détaillées (--since pour réduire la période)",
  empty: (period: string) => `aucune activité sur la période (${period})`,
  malformed: (count: number) => `${count} ligne(s) d'historique illisible(s) ignorée(s)`,
  unsupported: (count: number) =>
    `${count} ligne(s) écrite(s) par une version plus récente de gup ignorée(s)`,
} as const;
