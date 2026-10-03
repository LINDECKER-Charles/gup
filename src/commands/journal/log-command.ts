import type { Command } from "commander";
import { stateDir } from "../../core/state/app-dirs.js";
import { LOG_COMMAND_LABELS, LOG_MESSAGES } from "../../ui/text/log-labels.js";
import { showLog, type ShowOptions } from "./log-show.js";

const FAILURE_EXIT_CODE = 1;

/**
 * `gup log [show|path]`. `show` is the default: `gup log -n 20 -l warn`
 * reads the log. None of them writes to the log (the journal module installs
 * no sink for them).
 */
export function registerLogCommand(program: Command): void {
  const log = program.command("log").description(LOG_COMMAND_LABELS.log);
  log
    .command("show", { isDefault: true })
    .description(LOG_COMMAND_LABELS.show)
    .option("-n, --lines <n>", LOG_COMMAND_LABELS.lines)
    .option("-l, --level <niveau>", LOG_COMMAND_LABELS.level)
    .option("-s, --since <période>", LOG_COMMAND_LABELS.since)
    .option("-g, --grep <texte>", LOG_COMMAND_LABELS.grep)
    .option("--json", LOG_COMMAND_LABELS.json)
    .action(async (options: ShowOptions) => process.exit(await showLog(options)));
  log
    .command("path")
    .description(LOG_COMMAND_LABELS.path)
    .action(() => process.exit(printLogPath()));
}

/** `gup log path`: the log directory on stdout (pipeable), or why there is none. */
export function printLogPath(): number {
  const dir = stateDir("logs");
  if (dir === null) {
    process.stderr.write(`${LOG_MESSAGES.noDirectory}\n`);
    return FAILURE_EXIT_CODE;
  }
  process.stdout.write(`${dir}\n`);
  return 0;
}
