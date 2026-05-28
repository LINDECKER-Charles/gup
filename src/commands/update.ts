import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { runElevatedBatch } from "../core/elevation.js";
import { ALL_PROVIDERS, getProvider } from "../core/registry.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { promptPackageSelection, type SelectedPackage } from "../ui/select.js";
import {
  maybeRetryFailures,
  type OutcomeWithProvider,
} from "../ui/retry-failed.js";
import {
  beginSkipSession,
  discardPendingInterrupt,
  finalizeOutcome,
} from "../ui/skip-controller.js";
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
  // Validate every target up front so a typo doesn't open a skip session.
  const resolved: { providerId: string; provider: Provider; packageId: string }[] = [];
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
    resolved.push({ providerId, provider, packageId });
  }

  const entries: OutcomeWithProvider[] = [];
  const session = beginSkipSession();
  try {
    for (const { providerId, provider, packageId } of resolved) {
      if (session.isAbortRequested()) break;
      process.stdout.write(chalk.bold(`→ ${provider.displayName}: ${packageId}\n`));
      const outcome = finalizeOutcome(await provider.update(packageId));
      entries.push({ providerId, outcome });
    }
    const outcomes = await maybeRetryFailures(entries, { ...(opts.yes !== undefined && { yes: opts.yes }) });
    return summarize(outcomes);
  } finally {
    session.dispose();
  }
}

async function runSelection(
  selection: SelectedPackage[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  // Split admin-required packages out so we can batch them behind a single
  // UAC prompt instead of letting each provider SKIP them at update time.
  // `requiresAdmin` is set at scan time (see ChocoProvider.listOutdated),
  // and is only true when the current process is NOT already elevated.
  const adminSelection: SelectedPackage[] = [];
  const normalSelection: SelectedPackage[] = [];
  for (const sel of selection) {
    if (sel.pkg.requiresAdmin) adminSelection.push(sel);
    else normalSelection.push(sel);
  }

  const grouped = new Map<string, OutdatedPackage[]>();
  for (const sel of normalSelection) {
    const list = grouped.get(sel.providerId) ?? [];
    list.push(sel.pkg);
    grouped.set(sel.providerId, list);
  }

  const entries: OutcomeWithProvider[] = [];
  const session = beginSkipSession();
  try {
    // One package at a time (not provider.updateAll) so a timeout / Ctrl+C
    // maps cleanly to a single package: the rest of the batch keeps going.
    outer: for (const [providerId, pkgs] of grouped) {
      const provider = getProvider(providerId);
      if (!provider) continue;
      process.stdout.write(
        chalk.bold(`\n→ ${provider.displayName} (${pkgs.length})\n`),
      );
      for (const pkg of pkgs) {
        if (session.isAbortRequested()) break outer;
        const outcome = finalizeOutcome(await provider.update(pkg.id));
        entries.push({ providerId, outcome });
      }
    }

    if (!session.isAbortRequested() && adminSelection.length > 0) {
      const adminEntries = await runAdminBatch(adminSelection, { ...(opts.yes !== undefined && { yes: opts.yes }) });
      // The elevated PowerShell wait goes through runInherit too; drop any
      // interrupt flag it left so it can't mislabel a later retried package.
      discardPendingInterrupt();
      entries.push(...adminEntries);
    }

    const outcomes = await maybeRetryFailures(entries, { ...(opts.yes !== undefined && { yes: opts.yes }) });
    return summarize(outcomes);
  } finally {
    session.dispose();
  }
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

/**
 * Group every admin-required package behind a single UAC prompt and dispatch
 * the elevated batch through {@link runElevatedBatch}. When the user declines
 * the elevation we surface the whole batch as skipped (not failed) — they made
 * a deliberate choice, not a runtime crash.
 */
async function runAdminBatch(
  adminSelection: SelectedPackage[],
  opts: { yes?: boolean } = {},
): Promise<OutcomeWithProvider[]> {
  const targets = adminSelection.map((s) => `${s.providerId}:${s.pkg.id}`);
  process.stdout.write(
    chalk.bold(`\n→ Admin (${adminSelection.length})\n`) +
      chalk.dim(`  ${targets.join(", ")}\n`),
  );

  const elevate =
    opts.yes ||
    (await confirm({
      message: `${adminSelection.length} paquet(s) nécessitent les droits administrateur. Ouvrir une invite UAC pour les traiter en bloc ?`,
      default: true,
    }));
  if (!elevate) {
    return adminSelection.map((s) => ({
      providerId: s.providerId,
      outcome: {
        id: s.pkg.id,
        success: false,
        skipped: true,
        message: "Élévation refusée par l'utilisateur",
      },
    }));
  }

  const outcomes = await runElevatedBatch(targets);
  // runElevatedBatch enforces 1-to-1 ordering with `targets` (see
  // src/core/elevation.ts: readBatchOutput rejects length mismatches and
  // produces fallback failures rather than letting the indexes drift).
  // We can therefore zip outcomes with the corresponding `provider:packageId`
  // entry and recover providerId from that — no need to thread it through
  // the IPC payload.
  return outcomes.map((outcome, i) => {
    const target = targets[i] ?? "";
    const providerId = target.includes(":") ? target.slice(0, target.indexOf(":")) : "";
    return { providerId, outcome };
  });
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
    // Surface advisory messages attached to successful outcomes (e.g. choco
    // exit 3010 = installed, reboot required). Without this branch the
    // reboot-required information stays in the data model but never reaches
    // the user, who would only see "OK" and miss the action they need to
    // take. Skipped/failed messages already had their own branch below.
    for (const s of succeeded) {
      if (!s.message) continue;
      process.stdout.write(
        chalk.green(`     - ${s.id}`) + chalk.dim(` — ${s.message}`) + "\n",
      );
    }
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
