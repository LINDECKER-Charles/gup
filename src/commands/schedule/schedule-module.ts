import type { Command } from "commander";
import { log } from "../../core/log/log.js";
import { TICK_COMMAND } from "../../core/scheduler/trigger/task-command.js";
import { batchLockLocation, createBatchGuard } from "../../core/update/batch-lock.js";
import { observeUpdates, setBatchGuard } from "../../core/update/update-extensions.js";
import type { UpdateObserver } from "../../core/update/update-ports.js";
import {
  REPAIR_COMMAND,
  SCHEDULE_CLI_LABELS,
} from "../../ui/text/schedule/schedule-cli-labels.js";
import { SCHEDULE_COMMAND_LABELS } from "../../ui/text/schedule/schedule-command-labels.js";
import { triggerLine } from "../../ui/text/schedule/schedule-labels.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "../cli/cli-module.js";
import { addCommand, disableCommand, enableCommand, removeCommand } from "./crud-commands.js";
import { listSchedulesCommand, statusCommand } from "./report-commands.js";
import { runNowCommand } from "./run-now.js";
import {
  CONSOLE_OUTPUT,
  processSchedulerServices,
  readTriggerReport,
  type CommandOutput,
  type SchedulerServices,
  type TriggerReport,
} from "./scheduler-services.js";
import { menuSchedules } from "./schedules-controller.js";
import { runTick } from "./tick.js";
import { installCommand, uninstallCommand } from "./trigger-commands.js";

/**
 * The scheduler's place in the command line: `gup schedule …` and the hidden
 * `__schedule-tick`; the tick's run trigger ("schedule"); for every other
 * command, the batch guard that makes an interactive update wait for a
 * scheduled one; self-heal of the OS trigger when the menu or a reporting
 * `gup schedule` command starts; for the menu, the observer that records a
 * "run now" whose updates leave the screen; the scheduler's line of
 * `gup doctor`. The help is read when commander is built, after startup
 * chose the language.
 */

export interface ScheduleModuleDeps {
  readonly services: () => SchedulerServices | { readonly error: string };
  readonly output: CommandOutput;
  readonly exit: (code: number) => void;
  /** Records the menu's "run now" (the Schedules view's run tracker). */
  readonly menuRuns: () => UpdateObserver;
  /** The pipeline's process-wide observer slot. */
  readonly observe: (observer: UpdateObserver) => () => void;
}

/** Commands that repair a stale registration before they run (never a first one). */
const HEALING_COMMANDS = new Set(["", "schedule list", "schedule status", "schedule run-now"]);
const MENU_COMMAND = "";

export function createScheduleModule(deps: ScheduleModuleDeps): CliModule {
  return {
    id: "schedule",
    order: MODULE_ORDER.scheduler,
    register(program: Command) {
      registerCommands(program, deps);
    },
    triggerFor: (commandPath) => (commandPath === TICK_COMMAND ? "schedule" : undefined),
    async beforeAction({ commandPath }) {
      // The tick takes the batch itself, without waiting.
      if (commandPath === TICK_COMMAND) return;
      const location = batchLockLocation();
      if (location) setBatchGuard(createBatchGuard(location));
      if (!HEALING_COMMANDS.has(commandPath)) return;
      if (commandPath !== MENU_COMMAND) return heal(deps, true);
      deps.observe(deps.menuRuns());
      // The menu never waits for the OS: it heals in the background, logged only.
      heal(deps, false).catch((err: unknown) => {
        log.warn("scheduler.heal-failed", { error: String(err) });
      });
    },
    async diagnostics(): Promise<readonly DiagnosticLine[]> {
      const services = deps.services();
      if ("error" in services) {
        const label = SCHEDULE_CLI_LABELS.diagnosticLabel;
        return [{ label, value: services.error, status: "warn" }];
      }
      return [diagnosticOf(await readTriggerReport(services), services.clock())];
    },
  };
}

function registerCommands(program: Command, deps: ScheduleModuleDeps): void {
  const schedule = program.command("schedule").description(SCHEDULE_COMMAND_LABELS.schedule);
  const run = (command: (services: SchedulerServices) => Promise<number>) => async () => {
    const services = deps.services();
    if ("error" in services) {
      deps.output.err(services.error);
      return deps.exit(1);
    }
    deps.exit(await command(services));
  };
  registerReports(schedule, { deps, run });
  registerChanges(schedule, { deps, run });
  registerTrigger(schedule, { deps, run });
  program.command(TICK_COMMAND, { hidden: true }).action(async () => deps.exit(await runTick()));
}

type Runner = (command: (services: SchedulerServices) => Promise<number>) => () => Promise<void>;

interface Registration {
  readonly deps: ScheduleModuleDeps;
  readonly run: Runner;
}

function registerReports(schedule: Command, { deps, run }: Registration): void {
  const labels = SCHEDULE_COMMAND_LABELS;
  schedule
    .command("list")
    .description(labels.list)
    .option("--json", labels.json)
    .action((opts: { json?: boolean }) =>
      run((services) =>
        listSchedulesCommand(services, { json: opts.json === true }, deps.output),
      )(),
    );
  schedule
    .command("status")
    .description(labels.status)
    .option("--json", labels.json)
    .action((opts: { json?: boolean }) =>
      run((services) => statusCommand(services, { json: opts.json === true }, deps.output))(),
    );
}

interface AddFlags {
  every?: string;
  on?: string;
  at?: string;
  cron?: string;
  name?: string;
  catchUp: boolean;
  disabled?: boolean;
}

function registerChanges(schedule: Command, { deps, run }: Registration): void {
  const labels = SCHEDULE_COMMAND_LABELS;
  const { placeholders } = labels;
  schedule
    .command(`add <${placeholders.targets}...>`)
    .description(labels.add)
    .option(`--every <${placeholders.frequency}>`, labels.every)
    .option(`--on <${placeholders.day}>`, labels.on)
    .option("--at <HH:MM>", labels.at)
    .option("--cron <expression>", labels.cron)
    .option(`--name <${placeholders.name}>`, labels.name)
    .option("--no-catch-up", labels.noCatchUp)
    .option("--disabled", labels.disabled)
    .action((targets: string[], opts: AddFlags) =>
      run((services) => addCommand(services, addOptions(targets, opts), deps.output))(),
    );
  for (const [verb, description, command] of [
    ["remove", labels.remove, removeCommand],
    ["enable", labels.enable, enableCommand],
    ["disable", labels.disable, disableCommand],
  ] as const) {
    schedule
      .command(`${verb} <ids...>`)
      .description(description)
      .action((ids: string[]) => run((services) => command(services, ids, deps.output))());
  }
}

function registerTrigger(schedule: Command, { deps, run }: Registration): void {
  const labels = SCHEDULE_COMMAND_LABELS;
  schedule
    .command("run-now <id>")
    .description(labels.runNow)
    .action((id: string) => run((services) => runNowCommand(services, { id }, deps.output))());
  schedule
    .command("install")
    .description(labels.install)
    .option(`--launcher <${labels.placeholders.launcher}>`, labels.launcher)
    .action((opts: { launcher?: string }) =>
      run((services) => installCommand(services, launcherOf(opts), deps.output))(),
    );
  schedule
    .command("uninstall")
    .description(labels.uninstall)
    .option("--purge", labels.purge)
    .action((opts: { purge?: boolean }) =>
      run((services) => uninstallCommand(services, { purge: opts.purge === true }, deps.output))(),
    );
}

function addOptions(targets: string[], opts: AddFlags) {
  return {
    targets,
    catchUp: opts.catchUp,
    disabled: opts.disabled === true,
    ...(opts.every !== undefined && { every: opts.every }),
    ...(opts.on !== undefined && { on: opts.on }),
    ...(opts.at !== undefined && { at: opts.at }),
    ...(opts.cron !== undefined && { cron: opts.cron }),
    ...(opts.name !== undefined && { name: opts.name }),
  };
}

function launcherOf(opts: { launcher?: string }) {
  return opts.launcher !== undefined ? { launcher: opts.launcher } : {};
}

async function heal(deps: ScheduleModuleDeps, isVisible: boolean): Promise<void> {
  const services = deps.services();
  if ("error" in services || !services.sync) return;
  const enabled = services.repo.list().filter((schedule) => schedule.enabled).length;
  const result = await services.sync.heal(enabled);
  if (isVisible && result.kind === "installed") {
    deps.output.err(SCHEDULE_CLI_LABELS.triggerRepaired);
  }
}

function diagnosticOf(report: TriggerReport, now: Date): DiagnosticLine {
  const { health } = report;
  const label = SCHEDULE_CLI_LABELS.diagnosticLabel;
  if (health.kind === "none") {
    return { label, value: SCHEDULE_CLI_LABELS.noActiveSchedule, status: "off" };
  }
  const state = report.mechanism
    ? triggerLine(health, { mechanism: report.mechanism, now, repair: REPAIR_COMMAND })
    : (report.unsupported ?? "");
  const value = SCHEDULE_CLI_LABELS.diagnosticValue(report.enabledCount, state);
  return { label, value, status: health.kind === "active" ? "ok" : "warn" };
}

export const scheduleModule: CliModule = createScheduleModule({
  services: processSchedulerServices,
  output: CONSOLE_OUTPUT,
  exit: (code) => process.exit(code),
  menuRuns: () => menuSchedules().runTracker,
  observe: observeUpdates,
});
