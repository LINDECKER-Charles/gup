import type { Insights, TrendPoint } from "../../core/insights/types.js";
import {
  addDays,
  compareDays,
  dayKeyOf,
  daysBetween,
  weekStartOf,
  type DayKey,
} from "../../core/time/calendar.js";
import type { Period } from "../../core/time/period.js";
import {
  HEATMAP_LABELS,
  KPI_LABELS,
  NO_DATA,
  SLOWEST_LABELS,
  TREND_LABELS,
} from "../text/activity-labels.js";
import { formatDuration, formatPercent, formatRelative } from "../text/fr-format.js";
import { fit, seg, type Line, type Segment, type Tone } from "../tui/styled-lines.js";
import type { ChartGlyphs } from "./chart-glyphs.js";
import { renderHeatmap } from "./heatmap.js";
import { sparkline } from "./sparkline.js";

/**
 * The blocks of the activity summary, shared by the journal's first tab and
 * `gup report --format text`: headline numbers, the calendar heatmap, the
 * outdated trend, the slowest scans. Each fits the width it is given.
 */

export interface ChartContext {
  readonly width: number;
  readonly glyphs: ChartGlyphs;
  readonly now: Date;
}

/** A labelled item of a list joined by " · ". */
interface Item {
  readonly text: string;
  readonly tone: Tone;
}

const SEPARATOR = " · ";
const GAP = "  ";
const MAX_HEATMAP_WEEKS = 53;
const DAYS_PER_WEEK = 7;
const SLOWEST_SHOWN = 3;
/** Narrowest sparkline worth drawing beside the full title. */
const MIN_SPARK_WIDTH = 8;

/** The period's numbers, then how recent the last update and scan are: wrapped to the width. */
export function kpiLines(insights: Insights, ctx: ChartContext): Line[] {
  const counts = countItems(insights);
  const recency = recencyItems(insights, ctx.now);
  return [...wrapItems(counts, ctx.width), ...wrapItems(recency, ctx.width)];
}

function countItems({ totals }: Insights): Item[] {
  const rate = totals.successRate;
  const rateItems: Item[] =
    rate === null ? [] : [{ text: KPI_LABELS.successRate(formatPercent(rate)), tone: "plain" }];
  return [
    { text: KPI_LABELS.updates(totals.successes), tone: "strong" },
    ...rateItems,
    { text: KPI_LABELS.packages(totals.distinctPackages), tone: "plain" },
    { text: KPI_LABELS.failures(totals.failures), tone: totals.failures > 0 ? "danger" : "plain" },
    { text: KPI_LABELS.skips(totals.skips), tone: "plain" },
    { text: KPI_LABELS.scans(totals.scans), tone: "plain" },
  ];
}

function recencyItems({ totals }: Insights, now: Date): Item[] {
  const ago = (iso: string | null) => (iso === null ? null : formatRelative(new Date(iso), now));
  const lastUpdate = ago(totals.lastUpdateAt);
  const lastScan = ago(totals.lastScanAt);
  const items: Item[] = [
    { text: lastUpdate ? KPI_LABELS.lastUpdate(lastUpdate) : KPI_LABELS.noUpdate, tone: "muted" },
    { text: lastScan ? KPI_LABELS.lastScan(lastScan) : KPI_LABELS.noScan, tone: "muted" },
  ];
  if (totals.lastOutdated !== null) {
    items.push({ text: KPI_LABELS.outdated(totals.lastOutdated), tone: "warning" });
  }
  return items;
}

/** Successful updates per day, as a calendar heatmap under its title. */
export function heatmapSection(insights: Insights, ctx: ChartContext): Line[] {
  const counts = new Map(insights.days.map((day) => [day.day, day.success] as const));
  const end = lastDayOf(insights.period, ctx.now);
  const heatmap = renderHeatmap({
    counts,
    end,
    maxWeeks: weeksOf(insights.period, end),
    width: ctx.width,
    glyphs: ctx.glyphs,
  });
  return [[seg(HEATMAP_LABELS.title, "strong")], ...heatmap];
}

/** The outdated count of each day's last full scan as a sparkline, with its max and last value. */
export function trendLine(insights: Insights, ctx: ChartContext): Line {
  const values = dailySeries(insights.trend, lastDayOf(insights.period, ctx.now));
  if (values.length === 0) {
    return [seg(TREND_LABELS.title, "strong"), seg(`${GAP}${NO_DATA}`, "muted")];
  }
  const summary = `${GAP}${TREND_LABELS.summary(Math.max(...values), values.at(-1) ?? 0)}`;
  const room = (title: string) => ctx.width - title.length - GAP.length - summary.length;
  const isWide = room(TREND_LABELS.title) >= MIN_SPARK_WIDTH;
  const title = isWide ? TREND_LABELS.title : TREND_LABELS.shortTitle;
  return [
    seg(title, "strong"),
    seg(GAP),
    seg(sparkline(values, Math.max(1, room(title)), ctx.glyphs), "accent"),
    seg(summary, "muted"),
  ];
}

/** The providers whose own scan is the slowest, by median time. */
export function slowProvidersLine(insights: Insights, ctx: ChartContext): Line {
  const slowest = insights.providers
    .filter((provider) => provider.medianScanMs !== null)
    .sort((a, b) => (b.medianScanMs ?? 0) - (a.medianScanMs ?? 0))
    .slice(0, SLOWEST_SHOWN)
    .map((provider) => `${provider.providerId} ${formatDuration(provider.medianScanMs ?? 0)}`);
  const title = `${SLOWEST_LABELS.title}${GAP}`;
  const list = slowest.length > 0 ? slowest.join(SEPARATOR) : NO_DATA;
  const room = Math.max(0, ctx.width - title.length);
  return [seg(title, "strong"), seg(fit(list, room).trimEnd(), "muted")];
}

/** The last day the charts draw: today, or the period's last day when it ended before. */
function lastDayOf(period: Period, now: Date): DayKey {
  return dayKeyOf(period.until.getTime() < now.getTime() ? period.until : now);
}

/**
 * Week columns the heatmap needs to reach back to the period's first day, one
 * year at most: counted between Mondays, as a 30-day period starting on a
 * Sunday spans six calendar weeks.
 */
function weeksOf(period: Period, end: DayKey): number {
  if (period.since === null) return MAX_HEATMAP_WEEKS;
  const first = weekStartOf(dayKeyOf(period.since));
  const weeks = daysBetween(first, weekStartOf(end)) / DAYS_PER_WEEK + 1;
  return Math.min(MAX_HEATMAP_WEEKS, Math.max(1, weeks));
}

/** One value per day from the first point to `end`; a day without a full scan repeats the last. */
function dailySeries(trend: readonly TrendPoint[], end: DayKey): number[] {
  const first = trend[0];
  if (first === undefined) return [];
  const byDay = new Map(trend.map((point) => [point.day, point.outdated] as const));
  const values: number[] = [];
  let current = first.outdated;
  for (let day = first.day; compareDays(day, end) <= 0; day = addDays(day, 1)) {
    current = byDay.get(day) ?? current;
    values.push(current);
  }
  return values;
}

/** Items joined by " · ", a new line whenever the next one would not fit. */
function wrapItems(items: readonly Item[], width: number): Line[] {
  const lines: Segment[][] = [];
  let used = 0;
  for (const item of items) {
    const current = lines.at(-1);
    if (current && used + SEPARATOR.length + item.text.length <= width) {
      current.push(seg(SEPARATOR, "muted"), seg(item.text, item.tone));
      used += SEPARATOR.length + item.text.length;
    } else {
      lines.push([seg(item.text, item.tone)]);
      used = item.text.length;
    }
  }
  return lines;
}
