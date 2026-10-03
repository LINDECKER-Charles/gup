import chalk from "chalk";
import type { LogThreshold } from "../../core/log/log.js";
import { redactText } from "../../core/log/redact.js";
import { parseThreshold } from "../../core/log/types.js";
import {
  LOG_DIAGNOSTIC_LABELS,
  LOG_LEVEL_OPTION,
  LOG_MESSAGES,
  LOG_SOURCE_LABELS,
  thresholdLabel,
} from "../../ui/text/journal/log-labels.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "../cli/cli-module.js";
import { registerLogCommand } from "./log-command.js";
import { currentLogSession, logCrash, startLogSession, type LogSession } from "./log-session.js";
import { registerReportCommand } from "./report-command.js";

/**
 * The journal on the command line: the global `--log-level`, the `gup log`
 * commands, `gup report` (the activity history exported), the log installed
 * before every command (the elevated child included, with its memory sink),
 * the crash record, and its `gup doctor` line.
 */

const USAGE_EXIT_CODE = 2;

export const journalModule: CliModule = {
  id: "journal",
  order: MODULE_ORDER.logging,
  runsInElevatedChild: true,
  register(program) {
    program.option("--log-level <niveau>", LOG_LEVEL_OPTION);
    registerLogCommand(program);
    registerReportCommand(program);
  },
  beforeAction(context) {
    startLogSession(context, logLevelFlag(context.options["logLevel"]));
  },
  diagnostics: async () => [logDiagnostic(currentLogSession())],
  onCrash: logCrash,
};

/** `--log-level`, validated: anything but a level ends the run (exit 2) before it starts. */
function logLevelFlag(raw: unknown): LogThreshold | undefined {
  if (raw === undefined) return undefined;
  const threshold = typeof raw === "string" ? parseThreshold(raw) : null;
  if (threshold !== null) return threshold;
  process.stderr.write(`${chalk.red("Error:")} ${LOG_MESSAGES.badThreshold(String(raw))}\n`);
  return process.exit(USAGE_EXIT_CODE);
}

/** The "Système" line of `gup doctor`: what the log records, from where, into which directory. */
export function logDiagnostic(session: LogSession | null): DiagnosticLine {
  const line = (value: string, status: DiagnosticLine["status"]): DiagnosticLine => ({
    label: LOG_DIAGNOSTIC_LABELS.label,
    value,
    status,
  });
  if (session === null) return line(LOG_DIAGNOSTIC_LABELS.unavailable, "warn");
  const { settings, dir, backend } = session;
  const level = `${thresholdLabel(settings.threshold)} (${LOG_SOURCE_LABELS[settings.source]})`;
  if (settings.ignoredEnv !== undefined) {
    return line(`${level} · ${LOG_DIAGNOSTIC_LABELS.badEnv(settings.ignoredEnv)}`, "warn");
  }
  if (settings.threshold === "off") return line(level, "off");
  const failure = backend?.failure() ?? null;
  if (failure !== null) return line(`${level} · ${LOG_DIAGNOSTIC_LABELS.failed(failure)}`, "warn");
  if (dir === null) return line(`${level} · ${LOG_DIAGNOSTIC_LABELS.unavailable}`, "warn");
  return line(`${level} · ${redactText(dir)}`, "ok");
}
