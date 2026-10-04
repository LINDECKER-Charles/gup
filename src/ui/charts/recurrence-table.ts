import type { PackageRecurrence } from "../../core/insights/types.js";
import { CADENCE_LABELS, intervalLabel, RECURRENCE_COLUMNS } from "../text/journal/activity-labels.js";
import { formatCount } from "../text/format.js";
import { fit, seg, type Segment, type Tone } from "../tui/styled-lines.js";
import { providerLabel, type ProviderName } from "./activity-sections.js";
import { barText } from "./bar-chart.js";
import type { ChartGlyphs } from "./chart-glyphs.js";

/**
 * Packages as a table of bars — name, provider, successful updates (or
 * failed attempts) as a bar and a count, typical interval and cadence —
 * shared by the journal's Recurrence tab and `gup report --format text`.
 * Narrow tables drop the pace columns first, then the provider.
 */

export interface RecurrenceColumns {
  readonly name: number;
  /** 0 when the column is dropped. */
  readonly provider: number;
  readonly bar: number;
  readonly showsPace: boolean;
}

/** What the bars count: the successful updates, or the failed attempts of a table sorted by them. */
export type RecurrenceMeasure = "successes" | "failures";

export interface RecurrenceRowContext {
  readonly columns: RecurrenceColumns;
  readonly measure: RecurrenceMeasure;
  /** The measure of the longest bar. */
  readonly max: number;
  readonly glyphs: ChartGlyphs;
  /** A provider's display name from its id; without it, the id shows. */
  readonly providerName?: ProviderName | undefined;
}

/** The column titling each measure; its words are read when the header is drawn. */
const MEASURE_COLUMNS: Readonly<Record<RecurrenceMeasure, keyof typeof RECURRENCE_COLUMNS>> = {
  successes: "updates",
  failures: "failures",
};
const MEASURE_TONES: Readonly<Record<RecurrenceMeasure, Tone>> = {
  successes: "success",
  failures: "danger",
};

const COUNT_WIDTH = 4;
const INTERVAL_WIDTH = 6;
const CADENCE_WIDTH = 8;
const PROVIDER_WIDTH = 12;
const MIN_NAME_WIDTH = 12;
const MAX_NAME_WIDTH = 28;
const NAME_SHARE = 0.3;
const MIN_BAR_WIDTH = 4;
/** Below these widths the pace, then the provider, columns are dropped. */
const PACE_MIN_WIDTH = 70;
const PROVIDER_MIN_WIDTH = 50;
/** "  ~14 d weekly" after the count. */
const PACE_WIDTH = 2 + INTERVAL_WIDTH + 1 + CADENCE_WIDTH;

export function recurrenceColumns(width: number): RecurrenceColumns {
  const showsPace = width >= PACE_MIN_WIDTH;
  const provider = width >= PROVIDER_MIN_WIDTH ? PROVIDER_WIDTH : 0;
  const name = Math.min(MAX_NAME_WIDTH, Math.max(MIN_NAME_WIDTH, Math.floor(width * NAME_SHARE)));
  const fixed = name + 1 + (provider > 0 ? provider + 1 : 0) + 1 + COUNT_WIDTH;
  const bar = Math.max(MIN_BAR_WIDTH, width - fixed - (showsPace ? PACE_WIDTH : 0));
  return { name, provider, bar, showsPace };
}

export function recurrenceHeader(columns: RecurrenceColumns, measure: RecurrenceMeasure): Segment[] {
  const titles = [fit(RECURRENCE_COLUMNS.name, columns.name)];
  if (columns.provider > 0) titles.push(fit(RECURRENCE_COLUMNS.provider, columns.provider));
  titles.push(fit(RECURRENCE_COLUMNS[MEASURE_COLUMNS[measure]], columns.bar + 1 + COUNT_WIDTH));
  const pace = columns.showsPace ? `  ${RECURRENCE_COLUMNS.pace}` : "";
  return [seg(`${titles.join(" ")}${pace}`, "muted")];
}

/** One package as a row of the table. */
export function recurrenceRow(entry: PackageRecurrence, context: RecurrenceRowContext): Segment[] {
  const { columns, measure, max, glyphs } = context;
  const value = entry[measure];
  const cells: Segment[] = [seg(`${fit(entry.packageId, columns.name)} `)];
  if (columns.provider > 0) {
    cells.push(seg(`${fit(providerLabel(entry.providerId, context), columns.provider)} `, "muted"));
  }
  cells.push(
    seg(barText({ value, max, cells: columns.bar }, glyphs), MEASURE_TONES[measure]),
    seg(` ${formatCount(value).padStart(COUNT_WIDTH)}`),
  );
  if (columns.showsPace) {
    const interval = intervalLabel(entry.medianIntervalDays).padStart(INTERVAL_WIDTH);
    cells.push(seg(`  ${interval} ${fit(CADENCE_LABELS[entry.cadence], CADENCE_WIDTH)}`, "muted"));
  }
  return cells;
}
