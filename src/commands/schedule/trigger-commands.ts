import { purgeSchedulerFiles } from "../../core/scheduler/persistence/scheduler-files.js";
import type { SyncResult } from "../../core/scheduler/trigger/trigger-sync.js";
import {
  NOTHING_TO_INSTALL,
  PURGED,
  REPAIR_COMMAND,
  SCHEDULER_DIR_OVERRIDDEN,
  TRIGGER_REMOVED,
  triggerFailedLines,
  triggerInstalledLine,
  UNINSTALL_COMMAND,
  uninstalledLine,
} from "../../ui/text/schedule-cli-labels.js";
import { foreignInstallation } from "../../ui/text/schedule-labels.js";
import { parseLauncher } from "./schedule-args.js";
import type { CommandOutput, SchedulerServices } from "./scheduler-services.js";

/**
 * `gup schedule install` / `uninstall`, and how every command reports what
 * happened to the OS trigger. Exit codes: 0 ok, 1 the trigger could not be
 * changed, 2 invalid arguments.
 */

export interface InstallOptions {
  readonly launcher?: string;
}

export interface UninstallOptions {
  readonly purge: boolean;
}

export interface SyncReport {
  readonly services: SchedulerServices;
  readonly output: CommandOutput;
  /** The command that retries what failed. */
  readonly retry?: string;
}

/** Register (or repair) the trigger for this gup, explicitly. */
export async function installCommand(
  services: SchedulerServices,
  options: InstallOptions,
  output: CommandOutput,
): Promise<number> {
  const launcher = parseLauncher(options.launcher);
  if (typeof launcher === "object") {
    output.err(launcher.error);
    return 2;
  }
  if (enabledCount(services) === 0) {
    output.err(NOTHING_TO_INSTALL);
    return 1;
  }
  const result = services.sync
    ? await services.sync.reinstall(launcher)
    : unsupportedResult(services);
  return reportSync(result, { services, output });
}

/** Remove the trigger, then disable every schedule — or delete everything with `--purge`. */
export async function uninstallCommand(
  services: SchedulerServices,
  options: UninstallOptions,
  output: CommandOutput,
): Promise<number> {
  const result = services.sync ? await services.sync.remove() : { kind: "unchanged" as const };
  if (result.kind === "failed") {
    return reportSync(result, { services, output, retry: UNINSTALL_COMMAND });
  }
  if (options.purge) {
    purgeSchedulerFiles(services.files);
    output.out(PURGED);
    return 0;
  }
  const ids = services.repo.list().map((schedule) => schedule.id);
  output.out(uninstalledLine(services.repo.disable(ids)));
  return 0;
}

/** Bring the trigger in line with the schedules after a change. */
export function reconcileTrigger(services: SchedulerServices): Promise<SyncResult> {
  if (!services.sync) return Promise.resolve(unsupportedResult(services));
  return services.sync.reconcile(enabledCount(services));
}

/** Print what a sync did; returns the exit code it implies. */
export function reportSync(result: SyncResult, report: SyncReport): number {
  const { services, output } = report;
  switch (result.kind) {
    case "installed":
      if ("mechanism" in services.trigger) {
        output.out(triggerInstalledLine(services.trigger.mechanism));
      }
      if (services.isDirOverridden) output.err(SCHEDULER_DIR_OVERRIDDEN);
      return 0;
    case "removed":
      output.out(TRIGGER_REMOVED);
      return 0;
    case "foreign":
      output.out(foreignInstallation(result.entry, REPAIR_COMMAND));
      return 0;
    case "failed":
      for (const line of triggerFailedLines(result.reason, report.retry)) output.err(line);
      return 1;
    case "unchanged":
      return 0;
  }
}

/** `output` with every line indented, for details under a command's main line. */
export function indented(output: CommandOutput): CommandOutput {
  return { out: (line) => output.out(`  ${line}`), err: (line) => output.err(`  ${line}`) };
}

function enabledCount(services: SchedulerServices): number {
  return services.repo.list().filter((schedule) => schedule.enabled).length;
}

function unsupportedResult(services: SchedulerServices): SyncResult {
  const reason = "unsupported" in services.trigger ? services.trigger.unsupported : "";
  return { kind: "failed", reason };
}
