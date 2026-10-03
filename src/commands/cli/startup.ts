import chalk from "chalk";
import type { Command } from "commander";
import { ADMIN_BATCH_COMMAND } from "../../core/elevation.js";
import { setRunTrigger, type RunTrigger } from "../../core/state/run-context.js";
import { PromptCancelledError } from "../../ui/tui/prompt-cancelled.js";
import type { CliModule } from "./cli-module.js";

/** Exit code of a run the user cancelled with Ctrl+C (128 + SIGINT). */
const CANCELLED_EXIT_CODE = 130;
const FAILURE_EXIT_CODE = 1;

/**
 * Before any command runs: record what started this process, then let each
 * module install its slots, in {@link CliModule.order}. The elevated
 * `__admin-batch` child only runs the modules that opt in.
 */
export function installStartup(program: Command, modules: readonly CliModule[]): void {
  const ordered = [...modules].sort((a, b) => a.order - b.order);
  program.hook("preAction", async (_root, actionCommand) => {
    const commandPath = commandPathOf(actionCommand);
    setRunTrigger(triggerOf(commandPath, ordered));
    const isElevatedChild = commandPath === ADMIN_BATCH_COMMAND;
    const options = actionCommand.optsWithGlobals<Record<string, unknown>>();
    for (const cliModule of ordered) {
      if (isElevatedChild && cliModule.runsInElevatedChild !== true) continue;
      await cliModule.beforeAction?.({ commandPath, options });
    }
  });
}

/**
 * The last word on an uncaught error: modules hear about it first (the debug
 * log records the crash), then the process exits — silently with 130 on a
 * Ctrl+C in a prompt, with the message and 1 otherwise.
 */
export function handleFatal(error: unknown, modules: readonly CliModule[]): never {
  for (const cliModule of modules) {
    try {
      cliModule.onCrash?.(error);
    } catch {
      // A crash hook must not hide the crash it reports.
    }
  }
  if (error instanceof PromptCancelledError) {
    process.stdout.write("\n");
    process.exit(CANCELLED_EXIT_CODE);
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${chalk.red("Error:")} ${message}\n`);
  process.exit(FAILURE_EXIT_CODE);
}

/** "update", "log export", or "" for the program's own (menu) action. */
function commandPathOf(command: Command): string {
  const names: string[] = [];
  for (let current: Command | null = command; current?.parent; current = current.parent) {
    names.unshift(current.name());
  }
  return names.join(" ");
}

function triggerOf(commandPath: string, modules: readonly CliModule[]): RunTrigger {
  for (const cliModule of modules) {
    const trigger = cliModule.triggerFor?.(commandPath);
    if (trigger !== undefined) return trigger;
  }
  return commandPath === "" ? "menu" : "cli";
}
