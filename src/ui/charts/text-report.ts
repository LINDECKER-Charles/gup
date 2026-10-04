import type { FailureGroup, Insights } from "../../core/insights/types.js";
import {
  ACTIVITY_LABELS,
  periodLabel,
  TEXT_REPORT_LABELS,
} from "../text/journal/activity-labels.js";
import { fit, seg, type Line } from "../tui/styled-lines.js";
import {
  heatmapSection,
  kpiLines,
  providerLabel,
  slowProvidersLine,
  trendLine,
  type ChartContext,
} from "./activity-sections.js";
import { recurrenceColumns, recurrenceHeader, recurrenceRow } from "./recurrence-table.js";

/**
 * `gup report --format text`: the activity summary as terminal charts — the
 * journal's first tab, followed by the most updated packages and the
 * recurring failures.
 */

const TOP_PACKAGES = 10;
const TOP_FAILURES = 5;
const INDENT = "  ";

export function renderTextReport(insights: Insights, ctx: ChartContext): Line[] {
  const title: Line = [seg(TEXT_REPORT_LABELS.title(periodLabel(insights.period)), "strong")];
  const { attempts, scans } = insights.totals;
  if (attempts === 0 && scans === 0) return [title, [], [seg(ACTIVITY_LABELS.empty, "muted")]];
  return [
    title,
    [],
    ...kpiLines(insights, ctx),
    [],
    ...heatmapSection(insights, ctx),
    [],
    trendLine(insights, ctx),
    slowProvidersLine(insights, ctx),
    ...topPackages(insights, ctx),
    ...recurringFailures(insights.failures, ctx),
  ];
}

function topPackages(insights: Insights, ctx: ChartContext): Line[] {
  const entries = insights.recurrence.slice(0, TOP_PACKAGES);
  if (entries.length === 0) return [];
  const columns = recurrenceColumns(ctx.width - INDENT.length);
  const max = Math.max(1, ...entries.map((entry) => entry.successes));
  const { glyphs, providerName } = ctx;
  const context = { columns, measure: "successes", max, glyphs, providerName } as const;
  return [
    [],
    [seg(TEXT_REPORT_LABELS.topPackages, "strong")],
    [seg(INDENT), ...recurrenceHeader(columns, context.measure)],
    ...entries.map((entry): Line => [seg(INDENT), ...recurrenceRow(entry, context)]),
  ];
}

/** "  2× choco · nodejs — exit code 1603", cut to the width. */
function failureLine(failure: FailureGroup, ctx: ChartContext): Line {
  const subject = `${providerLabel(failure.providerId, ctx)} · ${failure.packageId}`;
  const head = `${INDENT}${TEXT_REPORT_LABELS.failure(failure.count, subject)}`;
  const message = failure.message ? ` — ${failure.message}` : "";
  const room = Math.max(0, ctx.width - head.length);
  return [seg(head, "danger"), seg(fit(message, room).trimEnd(), "muted")];
}

function recurringFailures(failures: readonly FailureGroup[], ctx: ChartContext): Line[] {
  if (failures.length === 0) return [];
  return [
    [],
    [seg(TEXT_REPORT_LABELS.failures, "strong")],
    ...failures.slice(0, TOP_FAILURES).map((failure) => failureLine(failure, ctx)),
  ];
}
