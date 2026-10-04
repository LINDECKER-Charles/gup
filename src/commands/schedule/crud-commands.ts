import { ConfigWriteError } from "../../core/config/store.js";
import { PREVIEW_RUNS, upcomingRuns } from "../../core/scheduler/model/recurrence.js";
import { targetKey } from "../../core/scheduler/model/schedule-target.js";
import type { Schedule, ScheduleDraft } from "../../core/scheduler/model/types.js";
import {
  mayAskForUac,
  validateDraft,
  type ValidationIssue,
} from "../../core/scheduler/model/validate-schedule.js";
import { formatRelative } from "../../ui/text/format.js";
import {
  createdLine,
  disabledLine,
  disabledPreview,
  enabledLine,
  ISSUE_SUBJECTS,
  issueLine,
  nextRunsLine,
  notSavedLine,
  removedLine,
  SCHEDULE_CLI_LABELS,
} from "../../ui/text/schedule/schedule-cli-labels.js";
import { SCHEDULE_LABELS } from "../../ui/text/schedule/schedule-labels.js";
import { parseAddArgs, type AddOptions } from "./schedule-args.js";
import type { CommandOutput, SchedulerServices } from "./scheduler-services.js";
import { indented, reconcileTrigger, reportSync } from "./trigger-commands.js";

/**
 * `gup schedule add | remove | enable | disable`. Every change saves the
 * schedules first, then brings the OS trigger in line: a trigger failure
 * never loses a schedule (exit 1, with the command that retries). Exit 2:
 * invalid arguments, nothing changed.
 */

export async function addCommand(
  services: SchedulerServices,
  options: AddOptions,
  output: CommandOutput,
): Promise<number> {
  const parsed = parseAddArgs(options);
  if (!parsed.ok) return refuse(parsed.errors, output);
  const now = services.clock();
  const issues = validateDraft(parsed.draft, {
    now,
    providers: services.providers,
    existingCount: services.repo.list().length,
  });
  if (issues.length > 0) return refuse(issues.map((i) => issueLineOf(i, parsed.draft)), output);
  const schedule = save(() => services.repo.create(parsed.draft, now), output);
  if (!schedule) return 1;
  output.out(createdLine(schedule));
  const details = indented(output);
  details.out(
    schedule.enabled ? nextRunsLine(upcomingLabels(schedule, now)) : disabledPreview(schedule),
  );
  if (mayAskForUac(schedule.targets)) details.out(SCHEDULE_CLI_LABELS.wingetUacNote);
  return reportSync(await reconcileTrigger(services), { services, output: details });
}

export async function removeCommand(
  services: SchedulerServices,
  ids: readonly string[],
  output: CommandOutput,
): Promise<number> {
  return changeSchedules(services, { ids, output }, {
    apply: (found) => services.repo.remove(found.map((schedule) => schedule.id)),
    describe: removedLine,
  });
}

export async function enableCommand(
  services: SchedulerServices,
  ids: readonly string[],
  output: CommandOutput,
): Promise<number> {
  const now = services.clock();
  return changeSchedules(services, { ids, output }, {
    apply: (found) => services.repo.enable(found.map((schedule) => schedule.id), now),
    describe: (schedule) => enabledLine(schedule, upcomingLabels(schedule, now)[0] ?? "—"),
  });
}

export async function disableCommand(
  services: SchedulerServices,
  ids: readonly string[],
  output: CommandOutput,
): Promise<number> {
  return changeSchedules(services, { ids, output }, {
    apply: (found) => services.repo.disable(found.map((schedule) => schedule.id)),
    describe: disabledLine,
  });
}

/** The next occurrences in words: "Mon, Oct 5 09:00", "tomorrow 09:00"… */
export function upcomingLabels(schedule: Schedule, now: Date): string[] {
  if (!schedule.enabled) return [SCHEDULE_LABELS.disabledNextRun];
  return upcomingRuns(schedule.recurrence, now, PREVIEW_RUNS).map((at) => formatRelative(at, now));
}

interface Change {
  apply(found: readonly Schedule[]): number;
  describe(schedule: Schedule): string;
}

/** Resolve every id first (nothing changes on a bad one), save, report, reconcile. */
async function changeSchedules(
  services: SchedulerServices,
  request: { readonly ids: readonly string[]; readonly output: CommandOutput },
  change: Change,
): Promise<number> {
  const { output } = request;
  const found = resolveIds(services, request.ids);
  if ("errors" in found) return refuse(found.errors, output);
  if (save(() => change.apply(found.schedules), output) === undefined) return 1;
  const fresh = new Map(services.repo.list().map((schedule) => [schedule.id, schedule]));
  for (const schedule of found.schedules) {
    output.out(change.describe(fresh.get(schedule.id) ?? schedule));
  }
  return reportSync(await reconcileTrigger(services), { services, output: indented(output) });
}

function resolveIds(
  services: SchedulerServices,
  ids: readonly string[],
): { readonly schedules: Schedule[] } | { readonly errors: string[] } {
  const schedules = new Map<string, Schedule>();
  const errors: string[] = [];
  for (const id of ids) {
    const found = services.repo.find(id);
    if ("error" in found) errors.push(found.error);
    else schedules.set(found.id, found);
  }
  return errors.length > 0 ? { errors } : { schedules: [...schedules.values()] };
}

/** Run a write of the schedules file; undefined (and the reason printed) when it failed. */
function save<T>(write: () => T, output: CommandOutput): T | undefined {
  try {
    return write();
  } catch (err) {
    if (!(err instanceof ConfigWriteError)) throw err;
    output.err(notSavedLine(err.message));
    return undefined;
  }
}

function refuse(errors: readonly string[], output: CommandOutput): number {
  for (const error of errors) output.err(error);
  return 2;
}

/** A problem with what it is about: the package it names, else the field. */
function issueLineOf(issue: ValidationIssue, draft: ScheduleDraft): string {
  const target = issue.field.startsWith("target:")
    ? draft.targets[Number(issue.field.slice("target:".length))]
    : undefined;
  const subject = target ? targetKey(target) : (ISSUE_SUBJECTS[issue.field] ?? issue.field);
  return issueLine(subject, issue.message);
}
