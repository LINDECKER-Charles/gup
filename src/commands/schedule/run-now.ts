import { ManualRun, type ManualExecutor } from "../../core/scheduler/manual-run.js";
import { neededProviders } from "../../core/scheduler/model/tick-plan.js";
import type { ScheduleRunRecord } from "../../core/scheduler/model/types.js";
import { runNowHeader } from "../../ui/text/schedule-cli-labels.js";
import { runStatusLabel, targetResultLabel } from "../../ui/text/schedule-labels.js";
import { updateOnConsole } from "../update.js";
import { targetResolver } from "./run-deps.js";
import type { CommandOutput, SchedulerServices } from "./scheduler-services.js";

/**
 * `gup schedule run-now <id>`: the schedule's targets, now, on this
 * terminal — the same targeted scan and plan as a scheduled run (never a
 * whole provider, never elevated), then the update pipeline with its
 * console output. Waits, with a message, while a scheduled run holds the
 * update batch. The result becomes the schedule's last run; its next
 * occurrence is unchanged.
 */

/** The terminal run: `-y` semantics, so no retry question with destructive flags. */
const consoleExecutor: ManualExecutor = (requests) => updateOnConsole(requests, { yes: true });

export interface RunNowRequest {
  readonly id: string;
  /** Where the updates run; the terminal by default. */
  readonly execute?: ManualExecutor;
}

export async function runNowCommand(
  services: SchedulerServices,
  request: RunNowRequest,
  output: CommandOutput,
): Promise<number> {
  const schedule = services.repo.find(request.id);
  if ("error" in schedule) {
    output.err(schedule.error);
    return 2;
  }
  const names = neededProviders([schedule], services.providers).map((providerId) =>
    displayName(services, providerId),
  );
  output.out(runNowHeader(schedule, names));
  const manual = new ManualRun({
    clock: services.clock,
    resolver: targetResolver(services),
    state: services.state,
  });
  const record = await manual.run(schedule, request.execute ?? consoleExecutor);
  if (!record) return 1;
  for (const line of summaryLines(record, services)) output.out(line);
  return record.targets.some((target) => target.status === "failed") ? 1 : 0;
}

function summaryLines(record: ScheduleRunRecord, services: SchedulerServices): string[] {
  const rows = record.targets.map((result) => {
    const [providerId = "", ...rest] = result.target.split(":");
    const packageId = rest.join(":");
    return `  ${displayName(services, providerId)}  ${packageId}  ${targetResultLabel(result)}`;
  });
  return [`Résultat : ${runStatusLabel(record)}`, ...rows];
}

function displayName(services: SchedulerServices, providerId: string): string {
  const fact = services.providers.lookup(providerId);
  return fact.isFound ? fact.displayName : providerId;
}
