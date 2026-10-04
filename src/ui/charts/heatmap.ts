import {
  addDays,
  compareDays,
  dayOfMonth,
  monthOf,
  weekStartOf,
  type DayKey,
} from "../../core/time/calendar.js";
import { HEATMAP_LABELS } from "../text/journal/activity-labels.js";
import { seg, type Line, type Segment, type Tone } from "../tui/styled-lines.js";
import type { ChartGlyphs } from "./chart-glyphs.js";
import { quantileLevels } from "./scale.js";

/**
 * A calendar heatmap, GitHub's "contributions" layout: one column per week
 * (the last one is the current week), one row per weekday from Monday, one
 * mark per day whose density says how much happened — readable without
 * colour, the tone only doubles it. Month names sit above the first week
 * holding the 1st, unless they would run into the previous one.
 */

export interface HeatmapInput {
  readonly counts: ReadonlyMap<DayKey, number>;
  /** The last day drawn (today); later days of its week stay blank. */
  readonly end: DayKey;
  /** Weeks wanted; fewer are drawn when the width runs out. */
  readonly maxWeeks: number;
  readonly width: number;
  readonly glyphs: ChartGlyphs;
}

/** Row label column: "Mon ". */
const LABEL_WIDTH = 4;
const DAYS_PER_WEEK = 7;
const WIDE_CELL = 2;
const HEAT_LEVELS = 5;

interface Grid {
  readonly first: DayKey;
  readonly weeks: number;
  readonly cell: number;
}

/** The month row, seven weekday rows and the legend. */
export function renderHeatmap(input: HeatmapInput): Line[] {
  const grid = gridOf(input);
  const level = quantileLevels(countsInWindow(input, grid), HEAT_LEVELS);
  const context: RowContext = { input, grid, level };
  const rows = HEATMAP_LABELS.weekdays.map((label, weekday) => dayRow(context, label, weekday));
  const gridWidth = LABEL_WIDTH + grid.weeks * grid.cell;
  return [monthRow(grid, input.width), ...rows, legend(input.glyphs, gridWidth)];
}

/** Two columns per day when every wanted week fits that way, else one. */
function gridOf({ end, maxWeeks, width }: HeatmapInput): Grid {
  const cell = LABEL_WIDTH + maxWeeks * WIDE_CELL <= width ? WIDE_CELL : 1;
  const weeks = Math.max(1, Math.min(maxWeeks, Math.floor((width - LABEL_WIDTH) / cell)));
  return { first: addDays(weekStartOf(end), -DAYS_PER_WEEK * (weeks - 1)), weeks, cell };
}

function countsInWindow({ counts, end }: HeatmapInput, grid: Grid): number[] {
  const values: number[] = [];
  for (const [day, count] of counts) {
    if (compareDays(day, grid.first) >= 0 && compareDays(day, end) <= 0) values.push(count);
  }
  return values;
}

interface RowContext {
  readonly input: HeatmapInput;
  readonly grid: Grid;
  readonly level: (count: number) => number;
}

function dayRow({ input, grid, level }: RowContext, label: string, weekday: number): Line {
  const segments: Segment[] = [seg(label.padEnd(LABEL_WIDTH), "muted")];
  for (let week = 0; week < grid.weeks; week++) {
    const day = addDays(grid.first, week * DAYS_PER_WEEK + weekday);
    if (compareDays(day, input.end) > 0) {
      append(segments, " ".repeat(grid.cell), "plain");
      continue;
    }
    const heat = level(input.counts.get(day) ?? 0);
    const mark = `${input.glyphs.heat[heat] ?? ""}`.padEnd(grid.cell);
    append(segments, mark, heat === 0 ? "muted" : "success");
  }
  return segments;
}

/** Month names over the week holding the 1st, each clear of the previous one and within `width`. */
function monthRow(grid: Grid, width: number): Line {
  const { months } = HEATMAP_LABELS;
  let row = " ".repeat(LABEL_WIDTH);
  for (let week = 0; week < grid.weeks; week++) {
    const month = monthStarting(addDays(grid.first, week * DAYS_PER_WEEK));
    if (month === null) continue;
    const column = LABEL_WIDTH + week * grid.cell;
    const name = months[month] ?? "";
    const isClear = column > row.trimEnd().length;
    const fits = column + name.length <= width;
    if (isClear && fits) row = row.padEnd(column) + name;
  }
  return [seg(row.trimEnd(), "muted")];
}

/** The month whose 1st falls in the week starting `monday`, or null. */
function monthStarting(monday: DayKey): number | null {
  for (let offset = 0; offset < DAYS_PER_WEEK; offset++) {
    const day = addDays(monday, offset);
    if (dayOfMonth(day) === 1) return monthOf(day);
  }
  return null;
}

/** "less · ░ ▒ ▓ █ more", right-aligned under the grid. */
function legend(glyphs: ChartGlyphs, width: number): Line {
  const marks = glyphs.heat.map((mark, heat) => seg(` ${mark}`, heat === 0 ? "muted" : "success"));
  const { fewer, more } = HEATMAP_LABELS;
  const legendWidth = fewer.length + marks.length * 2 + 1 + more.length;
  const indent = " ".repeat(Math.max(0, width - legendWidth));
  return [seg(`${indent}${fewer}`, "muted"), ...marks, seg(` ${more}`, "muted")];
}

/** Add `text` to the row, merged into the last segment when the tone is the same. */
function append(segments: Segment[], text: string, tone: Tone): void {
  const last = segments.at(-1);
  if (last && last.tone === tone) segments[segments.length - 1] = seg(last.text + text, tone);
  else segments.push(seg(text, tone));
}
