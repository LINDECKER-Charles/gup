import chalk from "chalk";
import { localized } from "../core/i18n/localized.js";
import { redactText } from "../core/log/redact.js";
import { readProviderStatus } from "../core/platform/provider-status.js";
import { renderProvidersStatus } from "../ui/table.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "./cli/cli-module.js";

const DOCTOR_LABELS = localized({
  en: {
    description:
      "Shows the providers detected, not installed and incompatible with this system.",
    /** The section the CLI modules report in. */
    system: "System",
    unavailable: (reason: string) => `diagnostic unavailable (${reason})`,
    timedOut: "timed out",
  },
  fr: {
    description:
      "Affiche les providers détectés, ceux non installés et ceux incompatibles avec ce système.",
    system: "Système",
    unavailable: (reason) => `diagnostic indisponible (${reason})`,
    timedOut: "délai dépassé",
  },
});

/**
 * `gup doctor`: which providers this machine has, which it lacks (with how to
 * install them), which are foreign to this OS, then a "System" section where
 * each CLI module reports its own state (embedded terminal, scheduling,
 * settings, journal…). The bug report form asks for this output, so the
 * section's values are redacted like the log (home directory → `~`): every
 * module's paths read the same, and no user name is pasted.
 *
 * Detection goes through readProviderStatus(): eight probes at a time, each
 * capped, and providers foreign to this OS never probed — one wedged
 * `wsl.exe` can no longer hang the command. Module diagnostics are capped the
 * same way.
 */
export async function doctorCommand(modules: readonly CliModule[] = []): Promise<number> {
  process.stdout.write(`${renderProvidersStatus(await readProviderStatus())}\n`);
  const system = await systemDiagnostics(modules);
  if (system.length > 0) process.stdout.write(`${renderSystem(system)}\n`);
  return 0;
}

/** A module whose diagnostics take longer than this is reported as unavailable. */
export const DIAGNOSTIC_TIMEOUT_MS = 5_000;

const LABEL_WIDTH = 24;
const RULE_WIDTH = 40;

const STATUS_MARKS: Readonly<Record<DiagnosticLine["status"], string>> = {
  ok: chalk.green("●"),
  warn: chalk.yellow("▲"),
  off: chalk.gray("○"),
};

async function systemDiagnostics(modules: readonly CliModule[]): Promise<DiagnosticLine[]> {
  const reporting = modules.filter((cliModule) => cliModule.diagnostics !== undefined);
  return (await Promise.all(reporting.map(boundedDiagnostics))).flat();
}

/** One module's lines, or a single "unavailable" line when it fails or hangs. */
async function boundedDiagnostics(cliModule: CliModule): Promise<readonly DiagnosticLine[]> {
  const unavailable = (reason: string): DiagnosticLine[] => [
    { label: cliModule.id, value: DOCTOR_LABELS.unavailable(reason), status: "warn" },
  ];
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<DiagnosticLine[]>((resolve) => {
    timer = setTimeout(() => resolve(unavailable(DOCTOR_LABELS.timedOut)), DIAGNOSTIC_TIMEOUT_MS);
  });
  try {
    return await Promise.race([cliModule.diagnostics?.() ?? Promise.resolve([]), deadline]);
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

function renderSystem(lines: readonly DiagnosticLine[]): string {
  const rows = lines.map(
    ({ label, value, status }) =>
      `  ${STATUS_MARKS[status]} ${label.padEnd(LABEL_WIDTH)} ${redactText(value)}`,
  );
  const heading = [
    chalk.bold(`  ${DOCTOR_LABELS.system}`),
    chalk.dim(`  ${"─".repeat(RULE_WIDTH)}`),
  ];
  return ["", ...heading, ...rows].join("\n");
}

export const doctorModule: CliModule = {
  id: "doctor",
  order: MODULE_ORDER.commands,
  register(program, context) {
    program
      .command("doctor")
      .description(DOCTOR_LABELS.description)
      .action(async () => {
        const code = await doctorCommand(context.modules);
        process.exit(code);
      });
  },
};
