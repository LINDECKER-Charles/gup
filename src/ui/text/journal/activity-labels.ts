import { localized } from "../../../core/i18n/localized.js";
import type { Cadence } from "../../../core/insights/types.js";
import type { Period, PeriodUnit } from "../../../core/time/period.js";
import { counted, formatDate } from "../format.js";

/**
 * The words of the activity insights, in the interface's languages, shared
 * by the journal view and `gup report --format text`: periods, headline
 * numbers, chart titles and legends, cadences. Tests import these catalogs.
 */

/** Shown where a number or a chart has no data yet; the same mark in every language. */
export const NO_DATA = "—";

export const ACTIVITY_LABELS = localized({
  en: {
    /** A period without any update attempt nor scan. */
    empty: "No activity recorded in this period.",
    /** The typical interval between two updates, in whole days: "~14 d". */
    interval: (days: number) => `~${days} d`,
  },
  fr: {
    empty: "Aucune activité enregistrée sur cette période.",
    interval: (days) => `~${days} j`,
  },
});

export const HEATMAP_LABELS = localized({
  en: {
    title: "Successful updates per day",
    fewer: "less",
    more: "more",
    /** Month abbreviations, January first. */
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    /** Row labels, Monday first; every other day is left blank, as on GitHub. */
    weekdays: ["Mon", "", "Wed", "", "Fri", "", "Sun"],
  },
  fr: {
    title: "Mises à jour réussies par jour",
    fewer: "moins",
    more: "plus",
    months: [
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
    ],
    weekdays: ["lun", "", "mer", "", "ven", "", "dim"],
  },
});

export const TREND_LABELS = localized({
  en: {
    title: "Outdated packages (full scans)",
    shortTitle: "Outdated",
    summary: (max: number, current: number) => `max ${max} · current ${current}`,
  },
  fr: {
    title: "Paquets en retard (scans complets)",
    shortTitle: "En retard",
    summary: (max, current) => `max ${max} · actuel ${current}`,
  },
});

export const SLOWEST_LABELS = localized({
  en: { title: "Slowest scans" },
  fr: { title: "Scans les plus lents" },
});

export const TEXT_REPORT_LABELS = localized({
  en: {
    title: (period: string) => `gup — activity · ${period}`,
    topPackages: "Most updated packages",
    failures: "Recurring failures",
    failure: (count: number, subject: string) => `${count}× ${subject}`,
  },
  fr: {
    title: (period) => `gup — activité · ${period}`,
    topPackages: "Paquets les plus souvent mis à jour",
    failures: "Échecs récurrents",
    failure: (count, subject) => `${count}× ${subject}`,
  },
});

/** Column titles of the recurrence table. */
export const RECURRENCE_COLUMNS = localized({
  en: {
    name: "Package",
    provider: "Provider",
    updates: "Updates",
    failures: "Failures",
    pace: "Pace",
  },
  fr: {
    name: "Paquet",
    provider: "Provider",
    updates: "Mises à jour",
    failures: "Échecs",
    pace: "Rythme",
  },
});

/** Short cadence labels (a table column, 8 characters at most). */
export const CADENCE_LABELS = localized<Readonly<Record<Cadence, string>>>({
  en: {
    weekly: "weekly",
    monthly: "monthly",
    quarterly: "qtrly",
    rare: "rare",
    once: "once",
    none: NO_DATA,
  },
  fr: {
    weekly: "hebdo.",
    monthly: "mensuel",
    quarterly: "trim.",
    rare: "rare",
    once: "une fois",
    none: NO_DATA,
  },
});

/** Cadence labels in full (detail views). */
export const CADENCE_DESCRIPTIONS = localized<Readonly<Record<Cadence, string>>>({
  en: {
    weekly: "weekly",
    monthly: "monthly",
    quarterly: "quarterly",
    rare: "rare",
    once: "only once",
    none: "never succeeded",
  },
  fr: {
    weekly: "hebdomadaire",
    monthly: "mensuel",
    quarterly: "trimestriel",
    rare: "rare",
    once: "une seule fois",
    none: "jamais réussie",
  },
});

/** The typical interval: "~14 d", or "—" without one. */
export function intervalLabel(days: number | null): string {
  return days === null ? NO_DATA : ACTIVITY_LABELS.interval(Math.max(1, Math.round(days)));
}

/** The headline numbers of a period. */
export const KPI_LABELS = localized({
  en: {
    updates: (count: number) => counted(count, "update", "updates"),
    successRate: (percent: string) => `${percent} successful`,
    packages: (count: number) => counted(count, "package", "packages"),
    failures: (count: number) => counted(count, "failure", "failures"),
    skips: (count: number) => counted(count, "skipped", "skipped"),
    scans: (count: number) => counted(count, "scan", "scans"),
    lastUpdate: (when: string) => `last update ${when}`,
    noUpdate: "no successful update",
    lastScan: (when: string) => `last scan ${when}`,
    noScan: "no scan",
    outdated: (count: number) => `${counted(count, "package", "packages")} outdated`,
  },
  fr: {
    updates: (count) => counted(count, "mise à jour", "mises à jour"),
    successRate: (percent) => `${percent} réussies`,
    packages: (count) => counted(count, "paquet", "paquets"),
    failures: (count) => counted(count, "échec", "échecs"),
    skips: (count) => counted(count, "ignorée", "ignorées"),
    scans: (count) => counted(count, "scan", "scans"),
    lastUpdate: (when) => `dernière mise à jour ${when}`,
    noUpdate: "aucune mise à jour réussie",
    lastScan: (when) => `dernier scan ${when}`,
    noScan: "aucun scan",
    outdated: (count) => `${counted(count, "paquet", "paquets")} en retard`,
  },
});

/** A span of one unit back from now ("past month"), or of several ("past 12 months"). */
interface SpanWords {
  readonly one: string;
  readonly many: (count: number) => string;
}

const SPAN_WORDS = localized<Readonly<Record<PeriodUnit, SpanWords>>>({
  en: {
    d: { one: "past day", many: (count) => `past ${count} days` },
    w: { one: "past week", many: (count) => `past ${count} weeks` },
    m: { one: "past month", many: (count) => `past ${count} months` },
    y: { one: "past year", many: (count) => `past ${count} years` },
  },
  fr: {
    d: { one: "le dernier jour", many: (count) => `${count} derniers jours` },
    w: { one: "la dernière semaine", many: (count) => `${count} dernières semaines` },
    m: { one: "le dernier mois", many: (count) => `${count} derniers mois` },
    y: { one: "la dernière année", many: (count) => `${count} dernières années` },
  },
});

const PERIOD_WORDS = localized({
  en: {
    all: "all history",
    since: (date: string) => `since ${date}`,
    until: (start: string, date: string) => `${start} until ${date}`,
  },
  fr: {
    all: "tout l'historique",
    since: (date) => `depuis le ${date}`,
    until: (start, date) => `${start} jusqu'au ${date}`,
  },
});

/** What a sentence opening on a period starts with: several units back, one, or everything. */
type LeadKind = "many" | "one" | "all";

const PERIOD_LEADS = localized<Readonly<Record<LeadKind, string>>>({
  en: { many: "Over the", one: "Over the", all: "Across" },
  fr: { many: "Sur les", one: "Sur", all: "Sur" },
});

/**
 * "past 30 days", "past 12 months", "since 2026-01-01", "all history" — and
 * "… until 2026-03-31" when the period was given an end.
 */
export function periodLabel(period: Period): string {
  const start = periodStartLabel(period);
  return period.hasFixedEnd ? PERIOD_WORDS.until(start, formatDate(period.until)) : start;
}

/**
 * The period opening a sentence: "Over the past 12 months", "Over the past
 * month", "Across all history", "Since 2026-01-01" (and its end, if set).
 */
export function periodLead(period: Period): string {
  const label = periodLabel(period);
  const { scope } = period;
  if (scope.kind === "date" && period.since !== null) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }
  return `${PERIOD_LEADS[leadKind(period)]} ${label}`;
}

function leadKind({ scope, since }: Period): LeadKind {
  if (scope.kind !== "span" || since === null) return "all";
  return scope.count > 1 ? "many" : "one";
}

function periodStartLabel(period: Period): string {
  const { scope } = period;
  if (scope.kind === "all" || period.since === null) return PERIOD_WORDS.all;
  if (scope.kind === "date") return PERIOD_WORDS.since(formatDate(period.since));
  const words = SPAN_WORDS[scope.unit];
  return scope.count === 1 ? words.one : words.many(scope.count);
}
