import { PREVIEW_RUNS, toCron, upcomingRuns } from "../../core/scheduler/model/recurrence.js";
import { targetKey } from "../../core/scheduler/model/schedule-target.js";
import type { Schedule, SchedulerState } from "../../core/scheduler/model/types.js";
import type { InstallRecord } from "../../core/scheduler/persistence/install-record.js";
import { STATUS_GLYPHS } from "../../ui/theme/glyphs.js";
import { formatDateTime } from "../../ui/text/fr-format.js";
import {
  NO_ACTIVE_TRIGGER,
  NO_SCHEDULE,
  REPAIR_COMMAND,
  STATUS_DETAILS,
  TABLE_HEADERS,
  unsupportedTriggerLine,
} from "../../ui/text/schedule-cli-labels.js";
import {
  recurrenceLabel,
  runStatusLabel,
  triggerLine,
} from "../../ui/text/schedule-labels.js";
import { upcomingLabels } from "./crud-commands.js";
import {
  readTriggerReport,
  type CommandOutput,
  type SchedulerServices,
  type TriggerReport,
} from "./scheduler-services.js";

/**
 * `gup schedule list` and `gup schedule status`: a table or JSON. The JSON
 * shapes are stable, for scripts: field names in English, dates ISO 8601.
 */

export interface ReportOptions {
  readonly json: boolean;
}

const COLUMN_GAP = "  ";

export async function listCommand(
  services: SchedulerServices,
  options: ReportOptions,
  output: CommandOutput,
): Promise<number> {
  const schedules = services.repo.list();
  const report = await readTriggerReport(services);
  const state = services.state.read();
  const now = services.clock();
  if (options.json) {
    output.out(JSON.stringify(listJson({ schedules, report, state, now }), null, 2));
    return 0;
  }
  if (schedules.length === 0) {
    output.out(NO_SCHEDULE);
    return 0;
  }
  const line = triggerSummary(report, now);
  if (line) output.out(line);
  for (const row of table(schedules.map((schedule) => rowOf(schedule, { state, now })))) {
    output.out(row);
  }
  return 0;
}

export async function statusCommand(
  services: SchedulerServices,
  options: ReportOptions,
  output: CommandOutput,
): Promise<number> {
  const report = await readTriggerReport(services);
  const location = "mechanism" in services.trigger ? await services.trigger.location() : null;
  const lastTickAt = services.state.read().lastTickAt ?? null;
  if (options.json) {
    output.out(JSON.stringify(statusJson(report, { location, lastTickAt }), null, 2));
    return 0;
  }
  for (const line of statusLines(report, { location, now: services.clock() })) output.out(line);
  return 0;
}

function statusLines(
  report: TriggerReport,
  context: { readonly location: string | null; readonly now: Date },
): string[] {
  const { record } = report;
  const recorded = record ? recordLines(record) : [];
  return [
    triggerSummary(report, context.now) || NO_ACTIVE_TRIGGER,
    ...(context.location ? [STATUS_DETAILS.location(context.location)] : []),
    ...recorded,
    STATUS_DETAILS.enabledCount(report.enabledCount),
  ];
}

function recordLines(record: InstallRecord): string[] {
  const installedAt = formatDateTime(new Date(record.installedAt));
  return [
    STATUS_DETAILS.command(record.argv, record.launcher),
    STATUS_DETAILS.installed(installedAt, record.gupVersion),
  ];
}

/** The trigger line, or the reason this platform has none. */
function triggerSummary(report: TriggerReport, now: Date): string {
  if (report.unsupported && report.enabledCount > 0) {
    return unsupportedTriggerLine(report.unsupported);
  }
  if (!report.mechanism) return "";
  const context = { mechanism: report.mechanism, now, repair: REPAIR_COMMAND };
  return triggerLine(report.health, context);
}

function rowOf(schedule: Schedule, context: { state: SchedulerState; now: Date }): string[] {
  const lastRun = context.state.schedules[schedule.id]?.lastRun;
  const lastAt = lastRun ? ` (${formatDateTime(new Date(lastRun.finishedAt))})` : "";
  return [
    schedule.id,
    schedule.enabled ? STATUS_GLYPHS.enabled : STATUS_GLYPHS.disabled,
    schedule.name,
    recurrenceLabel(schedule.recurrence),
    String(schedule.targets.length),
    upcomingLabels(schedule, context.now)[0] ?? "—",
    `${runStatusLabel(lastRun)}${lastAt}`,
  ];
}

/** Left-aligned columns, the package count right-aligned, two spaces apart. */
function table(rows: readonly string[][]): string[] {
  const headers = Object.values(TABLE_HEADERS);
  const all = [headers, ...rows];
  const widthOf = (column: number): number =>
    Math.max(...all.map((row) => (row[column] ?? "").length));
  const widths = headers.map((_, column) => widthOf(column));
  const countColumn = headers.indexOf(TABLE_HEADERS.targets);
  const align = (cell: string, column: number): string => {
    const width = widths[column] ?? 0;
    return column === countColumn ? cell.padStart(width) : cell.padEnd(width);
  };
  return all.map((row) => row.map(align).join(COLUMN_GAP).trimEnd());
}

function listJson(input: {
  schedules: readonly Schedule[];
  report: TriggerReport;
  state: SchedulerState;
  now: Date;
}) {
  return {
    trigger: {
      installed: input.report.status.isInstalled,
      mechanism: input.report.mechanism,
      health: input.report.health.kind,
      lastTickAt: input.state.lastTickAt ?? null,
    },
    schedules: input.schedules.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      enabled: schedule.enabled,
      recurrence: schedule.recurrence,
      cron: toCron(schedule.recurrence),
      targets: schedule.targets.map(targetKey),
      options: schedule.options,
      nextRuns: schedule.enabled ? nextRunsIso(schedule, input.now) : [],
      lastRun: input.state.schedules[schedule.id]?.lastRun ?? null,
    })),
  };
}

function nextRunsIso(schedule: Schedule, now: Date): string[] {
  return upcomingRuns(schedule.recurrence, now, PREVIEW_RUNS).map((at) => at.toISOString());
}

function statusJson(
  report: TriggerReport,
  extra: { readonly location: string | null; readonly lastTickAt: string | null },
) {
  return {
    installed: report.status.isInstalled,
    health: report.health.kind,
    mechanism: report.mechanism,
    location: extra.location,
    isDisabledByUser: report.status.isDisabledByUser,
    launcher: report.record?.launcher ?? null,
    argv: report.record?.argv ?? null,
    installedAt: report.record?.installedAt ?? null,
    gupVersion: report.record?.gupVersion ?? null,
    lastTickAt: extra.lastTickAt,
    enabledCount: report.enabledCount,
    ...(report.unsupported !== undefined && { unsupported: report.unsupported }),
  };
}
