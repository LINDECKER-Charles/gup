import type { Command } from "commander";
import { stateDir } from "../../core/state/app-dirs.js";
import {
  LOG_COMMAND_LABELS,
  LOG_MESSAGES,
  VALUE_PLACEHOLDERS as VALUE,
} from "../../ui/text/journal/log-labels.js";
import { exportDiagnostic, type ExportOptions } from "./diagnostic.js";
import { showLog, type ShowOptions } from "./log-show.js";

const FAILURE_EXIT_CODE = 1;

/**
 * `gup log [show|path|export]`. `show` is the default: `gup log -n 20 -l warn`
 * reads the log. None of them writes to the log (the journal module installs
 * no sink for them).
 */
export function registerLogCommand(program: Command): void {
  const log = program.command("log").description(LOG_COMMAND_LABELS.log);
  log
    .command("show", { isDefault: true })
    .description(LOG_COMMAND_LABELS.show)
    .option("-n, --lines <n>", LOG_COMMAND_LABELS.lines)
    .option(`-l, --level ${VALUE.level}`, LOG_COMMAND_LABELS.level)
    .option(`-s, --since ${VALUE.period}`, LOG_COMMAND_LABELS.since)
    .option(`-g, --grep ${VALUE.text}`, LOG_COMMAND_LABELS.grep)
    .option("--json", LOG_COMMAND_LABELS.json)
    .action(async (options: ShowOptions) => process.exit(await showLog(options)));
  log
    .command("path")
    .description(LOG_COMMAND_LABELS.path)
    .action(() => process.exit(printLogPath()));
  log
    .command("export")
    .description(LOG_COMMAND_LABELS.export)
    .option(`-s, --since ${VALUE.period}`, LOG_COMMAND_LABELS.since)
    .option(`-o, --out ${VALUE.file}`, LOG_COMMAND_LABELS.out)
    .option("--force", LOG_COMMAND_LABELS.force)
    .option("--no-history", LOG_COMMAND_LABELS.noHistory)
    .action(async (options: ExportOptions) => process.exit(await exportDiagnostic(options)));
}

/** `gup log path`: the log directory on stdout (pipeable), or why there is none. */
function printLogPath(): number {
  const dir = stateDir("logs");
  if (dir === null) {
    process.stderr.write(`${LOG_MESSAGES.noDirectory}\n`);
    return FAILURE_EXIT_CODE;
  }
  process.stdout.write(`${dir}\n`);
  return 0;
}
