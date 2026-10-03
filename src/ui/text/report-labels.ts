import { counted } from "./activity-labels.js";

/**
 * `gup report`'s words (French, the language of the interface): command and
 * option help, messages and errors. The exported data itself (JSON, CSV)
 * keeps English field names. Tests import these constants.
 */

export const REPORT_COMMAND_LABELS = {
  report: "Exporte l'historique d'activité : graphiques texte, JSON ou CSV.",
  format: "text (défaut), json ou csv",
  since: "période : 7d, 30d, 12w, 6m, 1y, all ou AAAA-MM-JJ (défaut 12m)",
  until: "date de fin AAAA-MM-JJ (défaut : maintenant)",
  out: "fichier de sortie (- pour la sortie standard)",
  force: "écrase le fichier --out s'il existe",
  delimiter: "séparateur CSV : , ; ou tab (défaut ,)",
} as const;

export const REPORT_MESSAGES = {
  badFormat: (raw: string) => `format inconnu : ${raw} (json, csv ou text)`,
  badSince: (raw: string) => `période invalide : ${raw} (ex. 30d, 12m, all, 2026-01-01)`,
  badUntil: (raw: string) => `date de fin invalide : ${raw} (AAAA-MM-JJ)`,
  untilBeforeSince: "la date de fin précède le début de la période",
  badDelimiter: (raw: string) => `séparateur CSV invalide : ${raw} (, ; ou tab)`,
  written: (path: string, events: number) =>
    `  export écrit : ${path} (${counted(events, "événement", "événements")})`,
  empty: (period: string) => `aucune activité sur la période (${period})`,
  unreadable: (reason: string) => `historique illisible : ${reason}`,
  malformed: (count: number) => `${count} ligne(s) d'historique illisible(s) ignorée(s)`,
  unsupported: (count: number) =>
    `${count} ligne(s) écrite(s) par une version plus récente de gup ignorée(s)`,
} as const;
