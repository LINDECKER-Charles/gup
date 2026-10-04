import { toCron, upcomingRuns } from "../../../core/scheduler/model/recurrence.js";
import type {
  RunStatus,
  Schedule,
  ScheduleRunRecord,
  TargetResult,
  TargetStatus,
} from "../../../core/scheduler/model/types.js";
import type { TriggerHealth } from "../../../core/scheduler/trigger/trigger-health.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { formatDuration, formatRelative } from "../../text/format.js";
import {
  DISABLED_NEXT_RUN,
  NEVER_RAN,
  recurrenceLabel,
  runStatusLabel,
  targetResultLabel,
  triggerLine,
} from "../../text/schedule/schedule-labels.js";
import {
  LIST_HEADERS,
  NEVER_RAN_DETAIL,
  NO_UPDATE_MARK,
  REPAIR_KEY,
  SCHEDULE_NOTICES,
  TRIGGER_CHECKING,
  lastRunHeading,
  nextRunDetail,
} from "../../text/schedule/schedule-menu-labels.js";
import { fillLine, fit, seg, type Line, type Tone } from "../../tui/styled-lines.js";
import type { SchedulesSnapshot, TriggerSummary } from "./schedules-port.js";

/**
 * The Planification list drawn as lines: the trigger's state, one row per
 * schedule, then what the schedule under the cursor covers and what its
 * last run did. Pure: the clock and the provider names are passed in.
 */

export interface ListRenderContext {
  readonly snapshot: SchedulesSnapshot;
  /** Null while it is being read. */
  readonly trigger: TriggerSummary | null;
  /** Index of the schedule under the cursor. */
  readonly cursor: number;
  readonly now: Date;
  readonly providerName: (providerId: string) => string;
  readonly width: number;
}

export interface ListRender {
  /** Above the rows: the trigger line, the column titles. */
  readonly head: readonly Line[];
  /** One per schedule, in order. */
  readonly rows: readonly Line[];
  /** Below the rows: the schedule under the cursor, its last run. */
  readonly details: readonly Line[];
}

const CURSOR = "› ";
const MARGIN = "  ";
/** The cursor and the enabled mark before the name. */
const ROW_LEAD = CURSOR.length + MARGIN.length;
/** Blank after each column but the last. */
const GAP = 1;
/** Narrowest the name and the recurrence get on a panel too narrow for them. */
const MIN_TEXT_WIDTH = 8;
/** The last run told by its mark alone (`√`, `±`, `×`, `—`): the details give its words. */
const LAST_MARK_WIDTH = 1;
const PROVIDER_WIDTH = 14;
const PACKAGE_WIDTH = 20;

interface Columns {
  readonly name: number;
  readonly recurrence: number;
  /** Zero: the column is not shown. */
  readonly count: number;
  /** Zero: the column is not shown. */
  readonly next: number;
  readonly last: number;
}

export function listLines(context: ListRenderContext): ListRender {
  const columns = columnsFor(context);
  const { schedules } = context.snapshot;
  const rows = schedules.map((schedule, index) => {
    const line = rowLine(schedule, { context, columns });
    return index === context.cursor ? fillLine(line, context.width, "highlight") : line;
  });
  const selected = schedules[context.cursor];
  return {
    head: [...triggerLines(context), headerLine(columns)],
    rows,
    details: selected ? detailLines(selected, context) : [],
  };
}

/** The line about the OS trigger, and a blank one; nothing when no schedule exists. */
function triggerLines(context: ListRenderContext): Line[] {
  const { trigger } = context;
  if (!trigger) return [[seg(TRIGGER_CHECKING, "muted")], []];
  // Nothing enabled: no trigger is needed, whatever the platform offers.
  if (trigger.health.kind === "none") return [];
  if (trigger.unsupported !== undefined) {
    return [[seg(SCHEDULE_NOTICES.unsupported(trigger.unsupported), "warning")], []];
  }
  if (!trigger.mechanism) return [];
  const line = triggerLine(trigger.health, {
    mechanism: trigger.mechanism,
    now: context.now,
    repair: REPAIR_KEY,
  });
  return [[seg(line, healthTone(trigger.health))], []];
}

function healthTone(health: TriggerHealth): Tone {
  if (health.kind === "active") return "muted";
  return health.kind === "stale" ? "danger" : "warning";
}

/**
 * Each column as wide as what it holds (its title at least). When they do
 * not all fit, the count and the next run go, then the last run keeps only
 * its mark — the details under the table give both in full — and only then
 * does the wider of the name and the recurrence shrink: on an 80-column
 * terminal a recurrence keeps its time (`le 15 de chaque mois à 09:00`).
 */
function columnsFor(context: ListRenderContext): Columns {
  const natural = naturalWidths(context);
  const full: Columns = { ...natural, count: LIST_HEADERS.targets.length };
  if (tableWidth(full) <= context.width) return full;
  const narrow: Columns = { ...natural, count: 0, next: 0 };
  if (tableWidth(narrow) <= context.width) return narrow;
  const room = context.width - ROW_LEAD - 2 * GAP - LAST_MARK_WIDTH;
  const [name = 0, recurrence = 0] = shrinkWidest(
    [natural.name, natural.recurrence],
    [MIN_TEXT_WIDTH, MIN_TEXT_WIDTH],
    room,
  );
  return { name, recurrence, count: 0, next: 0, last: LAST_MARK_WIDTH };
}

/** The width each text column needs to show every schedule whole. */
function naturalWidths(context: ListRenderContext): Omit<Columns, "count"> {
  const { schedules, state } = context.snapshot;
  const widest = (title: string, cells: readonly string[]): number =>
    Math.max(title.length, ...cells.map((cell) => cell.length));
  return {
    name: widest(LIST_HEADERS.name, schedules.map((schedule) => schedule.name)),
    recurrence: widest(
      LIST_HEADERS.recurrence,
      schedules.map((schedule) => recurrenceLabel(schedule.recurrence)),
    ),
    next: widest(LIST_HEADERS.next, schedules.map((schedule) => nextRun(schedule, context.now))),
    last: widest(
      LIST_HEADERS.last,
      schedules.map((schedule) => runStatusLabel(state.schedules[schedule.id]?.lastRun)),
    ),
  };
}

/** A row's width with these columns, the ones not shown left out. */
function tableWidth(columns: Columns): number {
  const shown = Object.values(columns).filter((width) => width > 0);
  return ROW_LEAD + shown.reduce((sum, width) => sum + width, 0) + GAP * (shown.length - 1);
}

/** `widths` narrowed one column at a time, the widest first, to fit `room` or their floors. */
function shrinkWidest(
  widths: readonly number[],
  floors: readonly number[],
  room: number,
): number[] {
  const shrunk = [...widths];
  let excess = shrunk.reduce((sum, width) => sum + width, 0) - room;
  while (excess > 0) {
    const candidates = shrunk.map((width, index) => (width > (floors[index] ?? 0) ? width : -1));
    const widest = candidates.indexOf(Math.max(...candidates));
    if (candidates[widest] === -1) break;
    shrunk[widest] = (shrunk[widest] ?? 0) - 1;
    excess -= 1;
  }
  return shrunk;
}

function headerLine(columns: Columns): Line {
  const cells = [
    `${MARGIN}${MARGIN}${fit(LIST_HEADERS.name, columns.name)}`,
    fit(LIST_HEADERS.recurrence, columns.recurrence),
    ...(columns.count > 0 ? [LIST_HEADERS.targets.padStart(columns.count)] : []),
    ...(columns.next > 0 ? [fit(LIST_HEADERS.next, columns.next)] : []),
    // A column of marks has no room for its title.
    ...(columns.last > LAST_MARK_WIDTH ? [LIST_HEADERS.last] : []),
  ];
  return [seg(cells.join(" "), "muted")];
}

/** The last run in its column: its words, or its mark alone in a column of marks. */
function lastRunCell(label: string, width: number): string {
  return width > LAST_MARK_WIDTH ? fit(label, width) : ([...label][0] ?? "");
}

function rowLine(
  schedule: Schedule,
  { context, columns }: { context: ListRenderContext; columns: Columns },
): Line {
  const isCursor = context.snapshot.schedules[context.cursor] === schedule;
  const lastRun = context.snapshot.state.schedules[schedule.id]?.lastRun;
  const glyph = schedule.enabled ? STATUS_GLYPHS.enabled : STATUS_GLYPHS.disabled;
  const count = String(schedule.targets.length).padStart(columns.count);
  const lastTone: Tone = lastRun ? runStatusTone(lastRun.status) : "muted";
  return [
    seg(isCursor ? CURSOR : MARGIN, "accent"),
    seg(`${glyph} `, schedule.enabled ? "success" : "muted"),
    seg(`${fit(schedule.name, columns.name)} `, schedule.enabled ? "strong" : "muted"),
    seg(`${fit(recurrenceLabel(schedule.recurrence), columns.recurrence)} `),
    ...(columns.count > 0 ? [seg(`${count} `, "muted")] : []),
    ...(columns.next > 0 ? [seg(`${fit(nextRun(schedule, context.now), columns.next)} `)] : []),
    seg(lastRunCell(runStatusLabel(lastRun), columns.last), lastTone),
  ];
}

/** The next occurrence in words, or "désactivée". */
function nextRun(schedule: Schedule, now: Date): string {
  if (!schedule.enabled) return DISABLED_NEXT_RUN;
  const [next] = upcomingRuns(schedule.recurrence, now, 1);
  return next ? formatRelative(next, now) : NEVER_RAN;
}

const STATUS_TONES: Readonly<Record<RunStatus, Tone>> = {
  success: "success",
  "up-to-date": "success",
  partial: "warning",
  skipped: "warning",
  failed: "danger",
  missed: "muted",
};

/** How a run's result reads: fine, mixed, failed, nothing happened. */
export function runStatusTone(status: RunStatus): Tone {
  return STATUS_TONES[status];
}

/** The schedule under the cursor: when it runs next, then its last run or its packages. */
function detailLines(schedule: Schedule, context: ListRenderContext): Line[] {
  const next = nextRunDetail(nextRun(schedule, context.now), toCron(schedule.recurrence));
  const lastRun = context.snapshot.state.schedules[schedule.id]?.lastRun;
  return [
    [],
    [seg(next, "muted")],
    ...(lastRun ? lastRunLines(schedule, { lastRun, context }) : neverRanLines(schedule, context)),
  ];
}

function lastRunLines(
  schedule: Schedule,
  { lastRun, context }: { lastRun: ScheduleRunRecord; context: ListRenderContext },
): Line[] {
  const finishedAt = new Date(lastRun.finishedAt);
  const took = formatDuration(finishedAt.getTime() - new Date(lastRun.startedAt).getTime());
  const when = formatRelative(finishedAt, context.now);
  const heading = lastRunHeading(schedule.name, { when, took, kind: lastRun.kind });
  return [
    [seg(heading, "strong")],
    ...lastRun.targets.map((result) => resultLine(result, context)),
  ];
}

function neverRanLines(schedule: Schedule, context: ListRenderContext): Line[] {
  return [
    [seg(NEVER_RAN_DETAIL, "muted")],
    ...schedule.targets.map((target): Line => [
      seg(`${MARGIN}${STATUS_GLYPHS.pending} `, "muted"),
      seg(`${fit(context.providerName(target.providerId), PROVIDER_WIDTH)} `),
      seg(target.packageId, "strong"),
    ]),
  ];
}

const RESULT_MARKS: Readonly<Record<TargetStatus, { glyph: string; tone: Tone }>> = {
  updated: { glyph: STATUS_GLYPHS.success, tone: "success" },
  "no-update": { glyph: NO_UPDATE_MARK, tone: "muted" },
  failed: { glyph: STATUS_GLYPHS.failed, tone: "danger" },
  skipped: { glyph: STATUS_GLYPHS.skipped, tone: "warning" },
};

function resultLine(result: TargetResult, context: ListRenderContext): Line {
  const separator = result.target.indexOf(":");
  const providerId = result.target.slice(0, separator);
  const packageId = result.target.slice(separator + 1);
  const mark = RESULT_MARKS[result.status];
  return [
    seg(`${MARGIN}${mark.glyph} `, mark.tone),
    seg(`${fit(context.providerName(providerId), PROVIDER_WIDTH)} `),
    seg(`${fit(packageId, PACKAGE_WIDTH)} `, "strong"),
    seg(targetResultLabel(result), mark.tone === "success" ? "plain" : mark.tone),
  ];
}
