import chalk from "chalk";
import { readProviderStatus } from "../core/platform/provider-status.js";
import { renderProvidersStatus } from "../ui/table.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "./cli/cli-module.js";

/**
 * `gup doctor`: which providers this machine has, which it lacks (with how to
 * install them), then a "Système" section where each CLI module reports its
 * own state (embedded terminal, scheduling, settings, journal…).
 *
 * Detection goes through readProviderStatus(): eight probes at a time, each
 * capped, and providers foreign to this OS never probed — one wedged
 * `wsl.exe` can no longer hang the command. Module diagnostics are capped the
 * same way.
 */
export async function doctorCommand(modules: readonly CliModule[] = []): Promise<number> {
  const report = await readProviderStatus();
  const detected = report.detected.map((provider) => provider.id);
  process.stdout.write(`${renderProvidersStatus(detected, [...report.missing])}\n`);
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
    { label: cliModule.id, value: `diagnostic indisponible (${reason})`, status: "warn" },
  ];
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<DiagnosticLine[]>((resolve) => {
    timer = setTimeout(() => resolve(unavailable("délai dépassé")), DIAGNOSTIC_TIMEOUT_MS);
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
    ({ label, value, status }) => `  ${STATUS_MARKS[status]} ${label.padEnd(LABEL_WIDTH)} ${value}`,
  );
  const heading = [chalk.bold("  Système"), chalk.dim(`  ${"─".repeat(RULE_WIDTH)}`)];
  return ["", ...heading, ...rows].join("\n");
}

export const doctorModule: CliModule = {
  id: "doctor",
  order: MODULE_ORDER.commands,
  register(program, context) {
    program
      .command("doctor")
      .description("Affiche les providers détectés et ceux non installés.")
      .action(async () => {
        const code = await doctorCommand(context.modules);
        process.exit(code);
      });
  },
};
