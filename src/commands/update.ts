import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { ALL_PROVIDERS, getProvider } from "../core/registry.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { promptPackageSelection, type SelectedPackage } from "../ui/select.js";
import {
  maybeRetryFailures,
  type OutcomeWithProvider,
} from "../ui/retry-failed.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

export interface UpdateOptions {
  only?: string[];
  fast?: boolean;
  all?: boolean;
  yes?: boolean;
  targets?: string[];
}

export async function updateCommand(options: UpdateOptions): Promise<number> {
  if (options.targets?.length) {
    return runTargets(options.targets, { ...(options.yes !== undefined && { yes: options.yes }) });
  }

  const { results: scans } = await scanWithProgress({
    ...(options.only && { only: options.only }),
    ...(options.fast !== undefined && { fast: options.fast }),
  });

  const allPackages: SelectedPackage[] = scans.flatMap((scan) =>
    scan.packages.map((pkg) => ({ providerId: scan.providerId, pkg })),
  );

  if (allPackages.length === 0) {
    process.stdout.write(`${chalk.green("à jour — aucune mise à jour disponible")}\n`);
    return 0;
  }

  let selection: SelectedPackage[];
  if (options.all) {
    selection = allPackages;
    if (!options.yes) {
      const ok = await confirm({
        message: `${selection.length} paquets à mettre à jour. Continuer ?`,
        default: true,
      });
      if (!ok) return 1;
    }
  } else {
    selection = await promptPackageSelection(scans);
    if (selection.length === 0) {
      process.stdout.write("Aucune sélection.\n");
      return 0;
    }
  }

  return runSelection(selection, { ...(options.yes !== undefined && { yes: options.yes }) });
}

async function runTargets(
  targets: string[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  const entries: OutcomeWithProvider[] = [];
  for (const target of targets) {
    const idx = target.indexOf(":");
    if (idx === -1) {
      process.stderr.write(formatBadTargetMessage(target, ALL_PROVIDERS));
      return 2;
    }
    const providerId = target.slice(0, idx);
    const packageId = target.slice(idx + 1);
    const provider = getProvider(providerId);
    if (!provider) {
      process.stderr.write(`Provider inconnu: ${providerId}\n`);
      return 2;
    }
    process.stdout.write(chalk.bold(`→ ${provider.displayName}: ${packageId}\n`));
    entries.push({ providerId, outcome: await provider.update(packageId) });
  }
  const outcomes = await maybeRetryFailures(entries, { ...(opts.yes !== undefined && { yes: opts.yes }) });
  return summarize(outcomes);
}

async function runSelection(
  selection: SelectedPackage[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  const grouped = new Map<string, OutdatedPackage[]>();
  for (const sel of selection) {
    const list = grouped.get(sel.providerId) ?? [];
    list.push(sel.pkg);
    grouped.set(sel.providerId, list);
  }

  const entries: OutcomeWithProvider[] = [];
  for (const [providerId, pkgs] of grouped) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    process.stdout.write(
      chalk.bold(`\n→ ${provider.displayName} (${pkgs.length})\n`),
    );
    const results =
      pkgs.length === 1
        ? [await provider.update(pkgs[0]!.id)]
        : await provider.updateAll(pkgs);
    for (const o of results) entries.push({ providerId, outcome: o });
  }
  const outcomes = await maybeRetryFailures(entries, { ...(opts.yes !== undefined && { yes: opts.yes }) });
  return summarize(outcomes);
}

/**
 * Build the actionable error message shown when a user passes a positional
 * argument to `gup update` without the `provider:packageId` separator.
 *
 * Pure / testable: the provider list is injected so the function can be
 * exercised without spinning the registry up. Preserves the historical
 * "Format invalide: ..." prefix to avoid breaking existing assertions and
 * downstream tooling that greps for it.
 */
export function formatBadTargetMessage(
  target: string,
  providers: readonly Pick<Provider, "id" | "displayName">[],
): string {
  // Preserve the historical prefix verbatim ("Attendu provider:packageId"
  // with no trailing period) so downstream greps / external tools that
  // pattern-match this line keep working.
  const head = `Format invalide: "${target}". Attendu provider:packageId`;
  const trimmed = target.trim();
  const key = trimmed.toLowerCase();
  // Case-insensitive on both id AND displayName: id resolution should not
  // silently differ from display-name resolution.
  const hint =
    providers.find((p) => p.id.toLowerCase() === key) ??
    providers.find((p) => p.displayName.toLowerCase() === key);

  const lines: string[] = [head];
  if (hint) {
    lines.push(
      `"${trimmed}" est un nom de provider, pas un identifiant de paquet.`,
      `Pour ce provider, essaie :`,
      `  gup list --provider ${hint.id}`,
      `  gup update --provider ${hint.id} --all`,
      `  gup                            # menu interactif`,
    );
  } else {
    lines.push(
      `Exemples : gup update winget:Microsoft.VisualStudioCode`,
      `           gup update npm-global:typescript`,
      `Pour mettre à jour tout un provider sans cibler un paquet :`,
      `           gup update --provider <id> --all`,
    );
  }
  return lines.join("\n") + "\n";
}

function summarize(outcomes: UpdateOutcome[]): number {
  const succeeded = outcomes.filter((o) => o.success);
  const skipped = outcomes.filter((o) => !o.success && o.skipped);
  const failed = outcomes.filter((o) => !o.success && !o.skipped);

  process.stdout.write("\n");
  if (succeeded.length > 0) {
    process.stdout.write(
      chalk.green(`OK   ${succeeded.length} mise(s) à jour effectuée(s)\n`),
    );
  }
  if (skipped.length > 0) {
    process.stdout.write(
      chalk.yellow(`SKIP ${skipped.length} action(s) manuelle(s) requise(s):\n`),
    );
    for (const s of skipped) {
      process.stdout.write(
        chalk.yellow(`     - ${s.id}`) +
          (s.message ? chalk.dim(` — ${s.message}`) : "") +
          "\n",
      );
    }
  }
  if (failed.length > 0) {
    process.stdout.write(
      chalk.red(`FAIL ${failed.length}/${outcomes.length} échec(s):\n`),
    );
    for (const f of failed) {
      process.stdout.write(
        chalk.red(`     - ${f.id}`) +
          (f.message ? chalk.dim(` — ${f.message}`) : "") +
          "\n",
      );
    }
  }
  return failed.length === 0 ? 0 : 1;
}
