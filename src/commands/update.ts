import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { getProvider } from "../core/registry.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { promptPackageSelection, type SelectedPackage } from "../ui/select.js";
import type { OutdatedPackage, UpdateOutcome } from "../core/types.js";

export interface UpdateOptions {
  only?: string[];
  fast?: boolean;
  all?: boolean;
  yes?: boolean;
  targets?: string[];
}

export async function updateCommand(options: UpdateOptions): Promise<number> {
  if (options.targets?.length) {
    return runTargets(options.targets);
  }

  const scans = await scanWithProgress({
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
    const automatable = allPackages.filter((p) => !p.pkg.manual);
    const manualOnly = allPackages.filter((p) => p.pkg.manual);
    selection = automatable;

    if (automatable.length === 0 && manualOnly.length > 0) {
      process.stdout.write(
        chalk.yellow(
          `${manualOnly.length} mise(s) à jour mais toutes nécessitent une action manuelle.\n`,
        ),
      );
      printManualList(manualOnly);
      return 0;
    }
    if (!options.yes) {
      const ok = await confirm({
        message: `${automatable.length} paquet(s) automatisable(s)${
          manualOnly.length > 0 ? `, ${manualOnly.length} ignoré(s) — action manuelle` : ""
        }. Continuer ?`,
        default: true,
      });
      if (!ok) return 1;
    }
    const exitCode = await runSelection(selection);
    if (manualOnly.length > 0) {
      process.stdout.write(
        chalk.yellow(`\n${manualOnly.length} action(s) manuelle(s) à faire toi-même:\n`),
      );
      printManualList(manualOnly);
    }
    return exitCode;
  }

  selection = await promptPackageSelection(scans);
  if (selection.length === 0) {
    process.stdout.write("Aucune sélection.\n");
    return 0;
  }
  return runSelection(selection);
}

function printManualList(items: SelectedPackage[]): void {
  for (const item of items) {
    const provider = getProvider(item.providerId);
    const label = provider?.displayName ?? item.providerId;
    const name = item.pkg.name ?? item.pkg.id;
    const note = item.pkg.note ? chalk.dim(` — ${item.pkg.note}`) : "";
    process.stdout.write(
      chalk.dim(`  · `) + `${name} ${chalk.dim(`(${label})`)}${note}\n`,
    );
  }
}

async function runTargets(targets: string[]): Promise<number> {
  const outcomes: UpdateOutcome[] = [];
  for (const target of targets) {
    const idx = target.indexOf(":");
    if (idx === -1) {
      process.stderr.write(`Format invalide: "${target}". Attendu provider:packageId\n`);
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
    outcomes.push(await provider.update(packageId));
  }
  return summarize(outcomes);
}

async function runSelection(selection: SelectedPackage[]): Promise<number> {
  const grouped = new Map<string, OutdatedPackage[]>();
  for (const sel of selection) {
    const list = grouped.get(sel.providerId) ?? [];
    list.push(sel.pkg);
    grouped.set(sel.providerId, list);
  }

  const outcomes: UpdateOutcome[] = [];
  for (const [providerId, pkgs] of grouped) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    process.stdout.write(
      chalk.bold(`\n→ ${provider.displayName} (${pkgs.length})\n`),
    );
    if (pkgs.length === 1) {
      outcomes.push(await provider.update(pkgs[0]!.id));
    } else {
      outcomes.push(...(await provider.updateAll(pkgs)));
    }
  }
  return summarize(outcomes);
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
