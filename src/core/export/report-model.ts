import type { HistoryReadStats } from "../history/reader.js";
import type { HistoryEvent, UpdateEvent } from "../history/types.js";
import { activeLocale, type Locale } from "../i18n/locale.js";
import type {
  FailureGroup,
  Insights,
  PackageRecurrence,
  ProviderStats,
  RunSummary,
} from "../insights/types.js";
import { redactText } from "../log/redact.js";
import { dayKeyOf } from "../time/calendar.js";
import {
  NONE,
  REPORT_SCHEMA_VERSION,
  STATUS_CODES,
  UPDATE_FLAGS,
  type DayRow,
  type ReportFailure,
  type ReportIntlLocale,
  type ReportMeta,
  type ReportModel,
  type ReportPackage,
  type ReportProvider,
  type ReportRun,
  type UpdateRow,
} from "./report-types.js";

/**
 * The HTML report's data, built from a period's events and the insights
 * computed from them: providers, packages and runs become tables the attempts
 * refer to by index, every free text is interned once — redacted (secrets,
 * home directory → `~`) and bounded on the way in — and the newest
 * {@link MAX_REPORT_UPDATES} attempts are kept. The figures (totals, days,
 * recurrence, failures) always cover the whole period, capped or not.
 */

/** Update attempts the report details; older ones are counted in `truncated`. */
export const MAX_REPORT_UPDATES = 50_000;
/** Characters kept of a free text (a message, a version, a package id). */
export const MAX_REPORT_TEXT = 2_000;
const ELLIPSIS = "…";
/** Separates the provider and the package in a package key (never in an id). */
const KEY_SEPARATOR = "\u0000";
/** UTF-16 high surrogates: the first half of a pair, never cut from its second. */
const HIGH_SURROGATES = { first: 0xd800, last: 0xdbff } as const;
/** The Intl locale a report written in each interface language formats with. */
const INTL_LOCALES: Readonly<Record<Locale, ReportIntlLocale>> = { en: "en-US", fr: "fr-FR" };

export interface ReportContext {
  readonly now: Date;
  /** Display name of a provider (`winget` → `Windows Package Manager`). */
  readonly nameOf: (providerId: string) => string;
  /** How the interface words the period, alone and opening a sentence. */
  readonly period: { readonly label: string; readonly lead: string };
  readonly gup: string;
  readonly platform: string;
  readonly timeZone: string;
}

export interface ReportModelInput {
  /** The period's events, oldest first: the ones `insights` was built from. */
  readonly events: readonly HistoryEvent[];
  readonly insights: Insights;
  readonly stats: HistoryReadStats;
  readonly context: ReportContext;
}

export function buildReportModel(input: ReportModelInput): ReportModel {
  return new ModelBuilder(input).build();
}

/** Strings interned by raw value: each distinct one is redacted and bounded once. */
class StringTable {
  readonly values: string[] = [];
  readonly #indexOf = new Map<string, number>();

  ref(raw: string | undefined): number {
    if (raw === undefined) return NONE;
    const known = this.#indexOf.get(raw);
    if (known !== undefined) return known;
    const index = this.values.push(safeText(raw)) - 1;
    this.#indexOf.set(raw, index);
    return index;
  }
}

/** Items in insertion order, found again by key. */
class Registry<T> {
  readonly list: T[] = [];
  readonly #indexOf = new Map<string, number>();

  indexOf(key: string, create: () => T): number {
    const known = this.#indexOf.get(key);
    if (known !== undefined) return known;
    const index = this.list.push(create()) - 1;
    this.#indexOf.set(key, index);
    return index;
  }
}

class ModelBuilder {
  readonly #input: ReportModelInput;
  readonly #strings = new StringTable();
  readonly #providers = new Registry<ReportProvider>();
  readonly #packages = new Registry<ReportPackage>();
  readonly #runs = new Map<string, number>();

  constructor(input: ReportModelInput) {
    this.#input = input;
  }

  build(): ReportModel {
    const { insights } = this.#input;
    for (const stats of insights.providers) this.provider(stats.providerId, stats);
    for (const recurrence of insights.recurrence) {
      this.package(recurrence.providerId, recurrence.packageId, recurrence);
    }
    insights.runs.forEach((run, index) => this.#runs.set(run.runId, index));
    const { rows, truncated } = this.updateRows();
    const failures = insights.failures.map((group) => this.failure(group));
    return {
      schema: REPORT_SCHEMA_VERSION,
      meta: reportMeta(this.#input),
      totals: insights.totals,
      providers: this.#providers.list,
      packages: this.#packages.list,
      runs: insights.runs.map(reportRun),
      updates: rows,
      days: insights.days.map((day): DayRow => [day.day, ...counts(day)]),
      weeks: insights.weeks.map((week): DayRow => [week.weekStart, ...counts(week)]),
      trend: insights.trend.map((point) => [point.day, point.outdated] as const),
      failures,
      truncated,
      // Last: every table above interned its texts already.
      strings: this.#strings.values,
    };
  }

  /** The newest attempts first, up to the cap, and how many were left out. */
  private updateRows(): { rows: UpdateRow[]; truncated: number } {
    const { events } = this.#input;
    const rows: UpdateRow[] = [];
    let total = 0;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event?.kind !== "update") continue;
      total++;
      if (rows.length < MAX_REPORT_UPDATES) rows.push(this.updateRow(event));
    }
    return { rows, truncated: total - rows.length };
  }

  private updateRow(event: UpdateEvent): UpdateRow {
    return [
      Date.parse(event.ts),
      this.package(event.providerId, event.packageId),
      STATUS_CODES[event.status],
      this.#strings.ref(event.from),
      this.#strings.ref(event.to),
      event.durationMs ?? NONE,
      this.#strings.ref(event.message),
      this.#runs.get(event.runId) ?? NONE,
      flagsOf(event),
      this.#strings.ref(event.retry),
    ];
  }

  private provider(providerId: string, stats?: ProviderStats): number {
    return this.#providers.indexOf(providerId, () => this.providerEntry(providerId, stats));
  }

  private providerEntry(providerId: string, stats: ProviderStats | undefined): ReportProvider {
    const identity = { id: clip(providerId), name: clip(this.#input.context.nameOf(providerId)) };
    if (stats === undefined) return { ...identity, ...NO_PROVIDER_ACTIVITY };
    return {
      ...identity,
      attempts: stats.attempts,
      successes: stats.successes,
      failures: stats.failures,
      skips: stats.skips,
      medianUpdateMs: stats.medianUpdateMs,
      medianScanMs: stats.medianScanMs,
      scanErrors: stats.scanErrors,
      lastScanError: this.#strings.ref(stats.lastScanError),
    };
  }

  /** A package known to the insights, or one the events name only (zero figures). */
  private package(providerId: string, packageId: string, recurrence?: PackageRecurrence): number {
    const key = `${providerId}${KEY_SEPARATOR}${packageId}`;
    return this.#packages.indexOf(key, () => {
      const identity = { provider: this.provider(providerId), id: safeText(packageId) };
      return recurrence === undefined
        ? { ...identity, ...NO_PACKAGE_ACTIVITY }
        : { ...identity, ...this.packageFigures(recurrence) };
    });
  }

  private packageFigures(recurrence: PackageRecurrence): Omit<ReportPackage, "provider" | "id"> {
    return {
      successes: recurrence.successes,
      failures: recurrence.failures,
      skips: recurrence.skips,
      firstAt: Date.parse(recurrence.firstAt),
      lastAt: Date.parse(recurrence.lastAt),
      lastVersion: this.#strings.ref(recurrence.lastVersion),
      medianIntervalDays: recurrence.medianIntervalDays,
      cadence: recurrence.cadence,
    };
  }

  private failure(group: FailureGroup): ReportFailure {
    return {
      package: this.package(group.providerId, group.packageId),
      message: this.#strings.ref(group.message),
      count: group.count,
      lastAt: Date.parse(group.lastAt),
    };
  }
}

const NO_PROVIDER_ACTIVITY = {
  attempts: 0,
  successes: 0,
  failures: 0,
  skips: 0,
  medianUpdateMs: null,
  medianScanMs: null,
  scanErrors: 0,
  lastScanError: NONE,
} as const;

const NO_PACKAGE_ACTIVITY = {
  successes: 0,
  failures: 0,
  skips: 0,
  firstAt: NONE,
  lastAt: NONE,
  lastVersion: NONE,
  medianIntervalDays: null,
  cadence: "none",
} as const;

function reportMeta({ insights, stats, context }: ReportModelInput): ReportMeta {
  const { period } = insights;
  return {
    generatedAt: context.now.toISOString(),
    gup: context.gup,
    platform: context.platform,
    timeZone: context.timeZone,
    // The active language's: the one the report's labels are rendered in.
    locale: INTL_LOCALES[activeLocale()],
    period: {
      key: period.key,
      label: context.period.label,
      lead: context.period.lead,
      since: period.since === null ? null : period.since.toISOString(),
      until: period.until.toISOString(),
      firstDay: period.since === null ? null : dayKeyOf(period.since),
      lastDay: dayKeyOf(period.until),
    },
    stats,
  };
}

function reportRun(run: RunSummary): ReportRun {
  return {
    id: clip(run.runId),
    startedAt: Date.parse(run.startedAt),
    endedAt: Date.parse(run.endedAt),
    trigger: run.trigger ?? null,
    scans: run.scans,
    lastOutdated: run.lastOutdated,
    successes: run.successes,
    failures: run.failures,
    skips: run.skips,
  };
}

function counts(activity: {
  readonly success: number;
  readonly failed: number;
  readonly skipped: number;
  readonly scans: number;
}): [number, number, number, number] {
  return [activity.success, activity.failed, activity.skipped, activity.scans];
}

function flagsOf(event: UpdateEvent): number {
  let flags = 0;
  if (event.retry !== undefined) flags |= UPDATE_FLAGS.retry;
  if (event.elevated === true) flags |= UPDATE_FLAGS.elevated;
  if (event.scheduleId !== undefined) flags |= UPDATE_FLAGS.scheduled;
  return flags;
}

/** Free text as the report shows it: secrets masked, home shortened, bounded. */
function safeText(raw: string): string {
  return clip(redactText(raw));
}

/** At most {@link MAX_REPORT_TEXT} characters, never splitting a surrogate pair. */
function clip(text: string): string {
  if (text.length <= MAX_REPORT_TEXT) return text;
  let end = MAX_REPORT_TEXT - ELLIPSIS.length;
  const last = text.charCodeAt(end - 1);
  if (last >= HIGH_SURROGATES.first && last <= HIGH_SURROGATES.last) end--;
  return `${text.slice(0, end)}${ELLIPSIS}`;
}
