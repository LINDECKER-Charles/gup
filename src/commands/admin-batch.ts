import chalk from "chalk";
import {
  ADMIN_BATCH_COMMAND,
  readBatchInput,
  writeBatchOutput,
  type AdminBatchInput,
} from "../core/elevation.js";
import { elevatedLogBuffer } from "../core/log/elevated-bridge.js";
import { applyLogThreshold } from "../core/log/log.js";
import { lookupProvider } from "../core/platform/lookup-provider.js";
import { setInstallTimeoutSeconds } from "../core/runner.js";
import { withOperation } from "../core/state/run-context.js";
import type { UpdateOutcome } from "../core/types.js";
import { MODULE_ORDER, type CliModule } from "./cli/cli-module.js";

/**
 * Elevated-child entrypoint for {@link runElevatedBatch}. Reads the JSON
 * payload written by the parent, runs each `provider:packageId` target
 * sequentially, and writes the matching outcomes to `<inputFile>.out`.
 *
 * This command MUST stay non-interactive: no prompts, no scans, no menu.
 * It runs in an already-elevated process and MUST NOT attempt to re-elevate
 * — that would be an infinite recursion guarded only by the user's UAC
 * patience. We therefore call `provider.update()` directly and never
 * `runElevatedBatch` from inside it. It never reads the user's settings
 * either: the parent's effective ones arrive in the payload. Its debug log
 * stays in memory and travels back with the outcomes (`log/elevated-bridge.ts`).
 */
export async function adminBatchCommand(inputFile: string): Promise<number> {
  let input;
  try {
    input = await readBatchInput(inputFile);
  } catch (err) {
    process.stderr.write(
      `${chalk.red("admin-batch:")} ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  applyParentSettings(input);
  const outcomes: UpdateOutcome[] = [];
  for (const target of input.targets) {
    outcomes.push(await runOneTarget(target));
  }

  try {
    await writeBatchOutput(`${inputFile}.out`, outcomes, elevatedLogBuffer.drain());
  } catch (err) {
    process.stderr.write(
      `${chalk.red("admin-batch:")} échec d'écriture des outcomes — ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  return outcomes.every((o) => o.success || o.skipped) ? 0 : 1;
}

/** Same install timeout and log threshold as the parent — absent fields keep the defaults. */
function applyParentSettings(input: AdminBatchInput): void {
  const { installTimeoutSeconds, logThreshold } = input;
  if (installTimeoutSeconds !== undefined) setInstallTimeoutSeconds(installTimeoutSeconds);
  if (logThreshold !== undefined) applyLogThreshold(logThreshold);
}

async function runOneTarget(target: string): Promise<UpdateOutcome> {
  const idx = target.indexOf(":");
  if (idx === -1) {
    return { id: target, success: false, message: `Format invalide: ${target}` };
  }
  const providerId = target.slice(0, idx);
  const packageId = target.slice(idx + 1);
  // Defence in depth for the elevated path: a tampered or stale batch file
  // cannot send an elevated process into a provider foreign to this host.
  const lookup = lookupProvider(providerId);
  if (!lookup.isFound) return { id: packageId, success: false, message: lookup.error };
  const { provider } = lookup;
  process.stdout.write(chalk.bold(`→ ${provider.displayName}: ${packageId}\n`));
  // Same operation context as an in-process update: the commands traced in
  // the child's log name the package they belong to.
  return withOperation({ op: "update", providerId: provider.id, packageId }, () =>
    provider.update(packageId),
  );
}

/**
 * Internal: invoked by the parent gup process after UAC / sudo elevation, to
 * run a pre-validated batch from a temp file. Hidden from `--help`; the name
 * is deliberately ugly so accidental discovery is hard.
 */
export const adminBatchModule: CliModule = {
  id: "admin-batch",
  order: MODULE_ORDER.commands,
  register(program) {
    program
      .command(`${ADMIN_BATCH_COMMAND} <file>`, { hidden: true })
      .description("Internal: run a pre-validated elevated batch from a temp file.")
      .action(async (file: string) => {
        const code = await adminBatchCommand(file);
        process.exit(code);
      });
  },
};
