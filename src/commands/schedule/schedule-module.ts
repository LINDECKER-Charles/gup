import type { Command } from "commander";
import { log } from "../../core/log/log.js";
import { TICK_COMMAND } from "../../core/scheduler/trigger/task-command.js";
import { batchLockLocation, createBatchGuard } from "../../core/update/batch-lock.js";
import { setBatchGuard } from "../../core/update/update-extensions.js";
import {
  DIAGNOSTIC_LABEL,
  NO_ACTIVE_SCHEDULE,
  REPAIR_COMMAND,
  TRIGGER_REPAIRED,
} from "../../ui/text/schedule-cli-labels.js";
import { triggerLine } from "../../ui/text/schedule-labels.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "../cli/cli-module.js";
import { addCommand, disableCommand, enableCommand, removeCommand } from "./crud-commands.js";
import { listCommand, statusCommand } from "./report-commands.js";
import { runNowCommand } from "./run-now.js";
import {
  CONSOLE_OUTPUT,
  readTriggerReport,
  schedulerServices,
  type CommandOutput,
  type SchedulerServices,
  type TriggerReport,
} from "./scheduler-services.js";
import { runTick } from "./tick.js";
import { installCommand, uninstallCommand } from "./trigger-commands.js";

/**
 * The scheduler's place in the command line: `gup schedule …` and the hidden
 * `__schedule-tick`; the tick's run trigger ("schedule"); for every other
 * command, the batch guard that makes an interactive update wait for a
 * scheduled one; self-heal of the OS trigger when the menu or a reporting
 * `gup schedule` command starts; the "Planification" line of `gup doctor`.
 */

export interface ScheduleModuleDeps {
  readonly services: () => SchedulerServices | { readonly error: string };
  readonly output: CommandOutput;
  readonly exit: (code: number) => void;
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
      // The menu never waits for the OS: it heals in the background, logged only.
      heal(deps, false).catch((err: unknown) => {
        log.warn("scheduler.heal-failed", { error: String(err) });
      });
    },
    async diagnostics(): Promise<readonly DiagnosticLine[]> {
      const services = deps.services();
      if ("error" in services) {
        return [{ label: DIAGNOSTIC_LABEL, value: services.error, status: "warn" }];
      }
      return [diagnosticOf(await readTriggerReport(services), services.clock())];
    },
  };
}

function registerCommands(program: Command, deps: ScheduleModuleDeps): void {
  const schedule = program
    .command("schedule")
    .description("Met à jour automatiquement des paquets précis, à heure fixe.");
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
  schedule
    .command("list")
    .description("Liste les planifications, leur prochaine et leur dernière exécution.")
    .option("--json", "Sortie JSON")
    .action((opts: { json?: boolean }) =>
      run((services) => listCommand(services, { json: opts.json === true }, deps.output))(),
    );
  schedule
    .command("status")
    .description("État du déclencheur système (tâche, agent launchd ou crontab).")
    .option("--json", "Sortie JSON")
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
  schedule
    .command("add <cibles...>")
    .description("Planifie des paquets (provider:paquet), jamais un provider entier.")
    .option("--every <fréquence>", "daily, weekly ou monthly")
    .option("--on <jour>", "weekly : lun…dim · monthly : 1 à 28 ou dernier")
    .option("--at <HH:MM>", "Heure (défaut 09:00)")
    .option("--cron <expression>", 'Expression cron à 5 champs, ex. "0 9 * * 1-5"')
    .option("--name <nom>", "Nom de la planification")
    .option("--no-catch-up", "Ne pas rattraper une exécution manquée")
    .option("--disabled", "Créer la planification désactivée")
    .action((targets: string[], opts: AddFlags) =>
      run((services) => addCommand(services, addOptions(targets, opts), deps.output))(),
    );
  for (const [verb, description, command] of [
    ["remove", "Supprime des planifications.", removeCommand],
    ["enable", "Active des planifications.", enableCommand],
    ["disable", "Désactive des planifications.", disableCommand],
  ] as const) {
    schedule
      .command(`${verb} <ids...>`)
      .description(description)
      .action((ids: string[]) => run((services) => command(services, ids, deps.output))());
  }
}

function registerTrigger(schedule: Command, { deps, run }: Registration): void {
  schedule
    .command("run-now <id>")
    .description("Exécute une planification maintenant, dans ce terminal.")
    .action((id: string) => run((services) => runNowCommand(services, { id }, deps.output))());
  schedule
    .command("install")
    .description("Installe ou répare le déclencheur système.")
    .option("--launcher <lanceur>", "Windows : headless (défaut) ou direct")
    .action((opts: { launcher?: string }) =>
      run((services) => installCommand(services, launcherOf(opts), deps.output))(),
    );
  schedule
    .command("uninstall")
    .description("Retire le déclencheur système et désactive les planifications.")
    .option("--purge", "Supprime aussi les planifications et leur état")
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
  if (isVisible && result.kind === "installed") deps.output.err(TRIGGER_REPAIRED);
}

function diagnosticOf(report: TriggerReport, now: Date): DiagnosticLine {
  const { health } = report;
  if (health.kind === "none") {
    return { label: DIAGNOSTIC_LABEL, value: NO_ACTIVE_SCHEDULE, status: "off" };
  }
  const state = report.mechanism
    ? triggerLine(health, { mechanism: report.mechanism, now, repair: REPAIR_COMMAND })
    : (report.unsupported ?? "");
  const value = `${report.enabledCount} active(s) — ${state}`;
  return { label: DIAGNOSTIC_LABEL, value, status: health.kind === "active" ? "ok" : "warn" };
}

/** One set of services per process, built on first use. */
function lazyServices(): () => SchedulerServices | { readonly error: string } {
  let services: ReturnType<typeof schedulerServices> | undefined;
  return () => (services ??= schedulerServices());
}

export const scheduleModule: CliModule = createScheduleModule({
  services: lazyServices(),
  output: CONSOLE_OUTPUT,
  exit: (code) => process.exit(code),
});
