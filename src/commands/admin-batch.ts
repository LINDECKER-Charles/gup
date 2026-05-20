import chalk from "chalk";
import { readBatchInput, writeBatchOutput } from "../core/elevation.js";
import { getProvider } from "../core/registry.js";
import type { UpdateOutcome } from "../core/types.js";

/**
 * Elevated-child entrypoint for {@link runElevatedBatch}. Reads the JSON
 * payload written by the parent, runs each `provider:packageId` target
 * sequentially, and writes the matching outcomes to `<inputFile>.out`.
 *
 * This command MUST stay non-interactive: no prompts, no scans, no menu.
 * It runs in an already-elevated process and MUST NOT attempt to re-elevate
 * — that would be an infinite recursion guarded only by the user's UAC
 * patience. We therefore call `provider.update()` directly and never
 * `runElevatedBatch` from inside it.
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

  const outcomes: UpdateOutcome[] = [];
  for (const target of input.targets) {
    outcomes.push(await runOneTarget(target));
  }

  try {
    await writeBatchOutput(`${inputFile}.out`, outcomes);
  } catch (err) {
    process.stderr.write(
      `${chalk.red("admin-batch:")} échec d'écriture des outcomes — ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  return outcomes.every((o) => o.success || o.skipped) ? 0 : 1;
}

async function runOneTarget(target: string): Promise<UpdateOutcome> {
  const idx = target.indexOf(":");
  if (idx === -1) {
    return { id: target, success: false, message: `Format invalide: ${target}` };
  }
  const providerId = target.slice(0, idx);
  const packageId = target.slice(idx + 1);
  const provider = getProvider(providerId);
  if (!provider) {
    return { id: packageId, success: false, message: `Provider inconnu: ${providerId}` };
  }
  process.stdout.write(chalk.bold(`→ ${provider.displayName}: ${packageId}\n`));
  return provider.update(packageId);
}
