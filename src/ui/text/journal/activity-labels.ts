import type { Cadence } from "../../../core/insights/types.js";
import type { Period, PeriodUnit } from "../../../core/time/period.js";
import { formatCount, formatDate } from "../fr-format.js";

/**
 * The words of the activity insights (French, the language of the
 * interface), shared by the journal view and `gup report --format text`:
 * periods, headline numbers, chart titles and legends, cadences. Tests
 * import these constants.
 */

/** French month abbreviations, January first. */
export const MONTH_ABBREVIATIONS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** Heatmap row labels, Monday first; every other day is left blank, as on GitHub. */
export const WEEKDAY_LABELS = ["lun", "", "mer", "", "ven", "", "dim"] as const;

export const HEATMAP_LABELS = {
  title: "Mises à jour réussies par jour",
  fewer: "moins",
  more: "plus",
} as const;

export const TREND_LABELS = {
  title: "Paquets en retard (scans complets)",
  shortTitle: "En retard",
  summary: (max: number, current: number) => `max ${max} · actuel ${current}`,
} as const;

export const SLOWEST_LABELS = {
  title: "Scans les plus lents",
} as const;

/** Shown where a number or a chart has no data yet. */
export const NO_DATA = "—";

export const EMPTY_ACTIVITY = "Aucune activité enregistrée sur cette période.";

export const TEXT_REPORT_LABELS = {
  title: (period: string) => `gup — activité · ${period}`,
  topPackages: "Paquets les plus souvent mis à jour",
  failures: "Échecs récurrents",
  failure: (count: number, subject: string) => `${count}× ${subject}`,
} as const;

/** Column titles of the recurrence table. */
export const RECURRENCE_COLUMNS = {
  name: "Paquet",
  provider: "Provider",
  updates: "Mises à jour",
  failures: "Échecs",
  pace: "Rythme",
} as const;

/** Short cadence labels (a table column, 8 characters at most). */
export const CADENCE_LABELS: Readonly<Record<Cadence, string>> = {
  weekly: "hebdo.",
  monthly: "mensuel",
  quarterly: "trim.",
  rare: "rare",
  once: "une fois",
  none: NO_DATA,
};

/** Cadence labels in full (detail views). */
export const CADENCE_DESCRIPTIONS: Readonly<Record<Cadence, string>> = {
  weekly: "hebdomadaire",
  monthly: "mensuel",
  quarterly: "trimestriel",
  rare: "rare",
  once: "une seule fois",
  none: "jamais réussie",
};

/** The typical interval: "~14 j", or "—" without one. */
export function intervalLabel(days: number | null): string {
  return days === null ? NO_DATA : `~${Math.max(1, Math.round(days))} j`;
}

/** "1 284 mises à jour": French plural, 0 and 1 take the singular. */
export function counted(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count <= 1 ? one : many}`;
}

/** The headline numbers of a period. */
export const KPI_LABELS = {
  updates: (count: number) => counted(count, "mise à jour", "mises à jour"),
  successRate: (percent: string) => `${percent} réussies`,
  packages: (count: number) => counted(count, "paquet", "paquets"),
  failures: (count: number) => counted(count, "échec", "échecs"),
  skips: (count: number) => counted(count, "ignorée", "ignorées"),
  scans: (count: number) => counted(count, "scan", "scans"),
  lastUpdate: (when: string) => `dernière mise à jour ${when}`,
  noUpdate: "aucune mise à jour réussie",
  lastScan: (when: string) => `dernier scan ${when}`,
  noScan: "aucun scan",
  outdated: (count: number) => `${counted(count, "paquet", "paquets")} en retard`,
} as const;

const SPAN_WORDS: Readonly<Record<PeriodUnit, readonly [one: string, many: string]>> = {
  d: ["le dernier jour", "derniers jours"],
  w: ["la dernière semaine", "dernières semaines"],
  m: ["le dernier mois", "derniers mois"],
  y: ["la dernière année", "dernières années"],
};

/**
 * "30 derniers jours", "12 derniers mois", "depuis le 01/01/2026", "tout
 * l'historique" — and "… jusqu'au 31/03/2026" when the period was given an end.
 */
export function periodLabel(period: Period): string {
  const start = periodStartLabel(period);
  return period.hasFixedEnd ? `${start} jusqu'au ${formatDate(period.until)}` : start;
}

/**
 * The period opening a sentence: "Sur les 12 derniers mois", "Sur le dernier
 * mois", "Sur tout l'historique", "Depuis le 01/01/2026" (and its end, if set).
 */
export function periodLead(period: Period): string {
  const label = periodLabel(period);
  const { scope } = period;
  if (scope.kind === "date" && period.since !== null) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }
  const isPlural = scope.kind === "span" && scope.count > 1 && period.since !== null;
  return `${isPlural ? "Sur les" : "Sur"} ${label}`;
}

function periodStartLabel(period: Period): string {
  const { scope } = period;
  if (scope.kind === "all" || period.since === null) return "tout l'historique";
  if (scope.kind === "date") return `depuis le ${formatDate(period.since)}`;
  const [one, many] = SPAN_WORDS[scope.unit];
  return scope.count === 1 ? one : `${scope.count} ${many}`;
}
