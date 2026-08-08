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
import type {
  OutdatedPackage,
  Provider,
  ProviderScanResult,
  UpdateOutcome,
} from "../core/types.js";

export interface UpdateOptions {
  only?: string[];
  fast?: boolean;
  all?: boolean;
  yes?: boolean;
  targets?: string[];
}

/** `{ yes }` only when the flag was passed, so a default is never overwritten. */
function yesFlag(options: { yes?: boolean }): { yes?: boolean } {
  return { ...(options.yes !== undefined && { yes: options.yes }) };
}

export async function updateCommand(options: UpdateOptions): Promise<number> {
  if (options.targets?.length) {
    return runTargets(options.targets, yesFlag(options));
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

  const chosen = await chooseSelection(allPackages, scans, options);
  if (chosen.kind === "declined") return 1;
  if (chosen.kind === "empty") return 0;
  return runSelection(chosen.packages, yesFlag(options));
}

type SelectionResult =
  | { kind: "selection"; packages: SelectedPackage[] }
  | { kind: "declined" }
  | { kind: "empty" };

/**
 * `--all` takes everything (subject to confirmation), otherwise the
 * interactive picker opens. The two "nothing to do" outcomes stay distinct:
 * a declined confirmation exits 1, an empty selection exits 0.
 */
async function chooseSelection(
  allPackages: SelectedPackage[],
  scans: ProviderScanResult[],
  options: UpdateOptions,
): Promise<SelectionResult> {
  if (!options.all) {
    const packages = await promptPackageSelection(scans);
    if (packages.length === 0) {
      process.stdout.write("Aucune sélection.\n");
      return { kind: "empty" };
    }
    return { kind: "selection", packages };
  }

  if (!options.yes) {
    const ok = await confirm({
      message: `${allPackages.length} paquets à mettre à jour. Continuer ?`,
      default: true,
    });
    if (!ok) return { kind: "declined" };
  }
  return { kind: "selection", packages: allPackages };
}

interface ResolvedTarget {
  providerId: string;
  provider: Provider;
  packageId: string;
}

/**
 * Resolve every `provider:packageId` up front, before opening a skip session:
 * a typo must not leave a session dangling behind it. Returns null after
 * writing the diagnostic to stderr.
 */
function resolveTargets(targets: string[]): ResolvedTarget[] | null {
  const resolved: ResolvedTarget[] = [];
  for (const target of targets) {
    const idx = target.indexOf(":");
    if (idx === -1) {
      process.stderr.write(formatBadTargetMessage(target, ALL_PROVIDERS));
      return null;
    }
    const providerId = target.slice(0, idx);
    const provider = getProvider(providerId);
    if (!provider) {
      process.stderr.write(`Provider inconnu: ${providerId}\n`);
      return null;
    }
    resolved.push({ providerId, provider, packageId: target.slice(idx + 1) });
  }
  return resolved;
}

async function runTargets(
  targets: string[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  const resolved = resolveTargets(targets);
  if (!resolved) return 2;

  const entries: OutcomeWithProvider[] = [];
  const session = beginSkipSession();
  try {
    for (const { providerId, provider, packageId } of resolved) {
      if (session.isAbortRequested()) break;
      process.stdout.write(chalk.bold(`→ ${provider.displayName}: ${packageId}\n`));
      const outcome = finalizeOutcome(await provider.update(packageId));
      entries.push({ providerId, outcome });
    }
    return summarize(await maybeRetryFailures(entries, yesFlag(opts)));
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
  const adminSelection = selection.filter((s) => s.pkg.requiresAdmin);
  const grouped = groupByProvider(selection.filter((s) => !s.pkg.requiresAdmin));

  const session = beginSkipSession();
  try {
    const entries = await applyGrouped(grouped, session);

    if (!session.isAbortRequested() && adminSelection.length > 0) {
      const adminEntries = await runAdminBatch(adminSelection, yesFlag(opts));
      // The elevated PowerShell wait goes through runInherit too; drop any
      // interrupt flag it left so it can't mislabel a later retried package.
      discardPendingInterrupt();
      entries.push(...adminEntries);
    }

    return summarize(await maybeRetryFailures(entries, yesFlag(opts)));
  } finally {
    session.dispose();
  }
}

/** Apply a provider→packages map, one provider at a time, under a session. */
async function applyGrouped(
  grouped: Map<string, OutdatedPackage[]>,
  session: { isAbortRequested: () => boolean },
): Promise<OutcomeWithProvider[]> {
  const entries: OutcomeWithProvider[] = [];
  for (const [providerId, pkgs] of grouped) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    process.stdout.write(
      chalk.bold(`\n→ ${provider.displayName} (${pkgs.length})\n`),
    );
    const done = await updateEach(provider, pkgs, session);
    entries.push(...done.map((outcome) => ({ providerId, outcome })));
    if (session.isAbortRequested()) break;
  }
  return entries;
}

function groupByProvider(
  selection: SelectedPackage[],
): Map<string, OutdatedPackage[]> {
  const grouped = new Map<string, OutdatedPackage[]>();
  for (const sel of selection) {
    const list = grouped.get(sel.providerId) ?? [];
    list.push(sel.pkg);
    grouped.set(sel.providerId, list);
  }
  return grouped;
}

/**
 * One package at a time (not provider.updateAll) so a timeout / Ctrl+C maps
 * cleanly to a single package: the rest of the batch keeps going. Extracted so
 * the caller's loop does not need a labelled break to unwind two levels.
 */
async function updateEach(
  provider: Provider,
  pkgs: OutdatedPackage[],
  session: { isAbortRequested: () => boolean },
): Promise<UpdateOutcome[]> {
  const outcomes: UpdateOutcome[] = [];
  for (const pkg of pkgs) {
    if (session.isAbortRequested()) break;
    outcomes.push(finalizeOutcome(await provider.update(pkg.id)));
  }
  return outcomes;
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

  const body = hint ? providerNameHint(trimmed, hint.id) : GENERIC_TARGET_EXAMPLES;
  return [head, ...body].join("\n") + "\n";
}

/** The user typed a provider name: show them the commands that do work. */
function providerNameHint(typed: string, providerId: string): string[] {
  return [
    `"${typed}" est un nom de provider, pas un identifiant de paquet.`,
    `Pour ce provider, essaie :`,
    `  gup list --provider ${providerId}`,
    `  gup update --provider ${providerId} --all`,
    `  gup                            # menu interactif`,
  ];
}

const GENERIC_TARGET_EXAMPLES = [
  `Exemples : gup update winget:Microsoft.VisualStudioCode`,
  `           gup update npm-global:typescript`,
  `Pour mettre à jour tout un provider sans cibler un paquet :`,
  `           gup update --provider <id> --all`,
];

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

  const elevate = opts.yes || (await confirmElevation(adminSelection.length));
  if (!elevate) return elevationDeclined(adminSelection);

  // runElevatedBatch enforces 1-to-1 ordering with `targets` (see
  // src/core/elevation.ts: readBatchOutput rejects length mismatches and
  // produces fallback failures rather than letting the indexes drift).
  // We can therefore zip outcomes with the corresponding `provider:packageId`
  // entry and recover providerId from that — no need to thread it through
  // the IPC payload.
  const outcomes = await runElevatedBatch(targets);
  return outcomes.map((outcome, i) => ({
    providerId: providerIdOf(targets[i] ?? ""),
    outcome,
  }));
}

function confirmElevation(count: number): Promise<boolean> {
  return confirm({
    message:
      `${count} paquet(s) nécessitent les droits administrateur. ` +
      `Ouvrir une invite UAC pour les traiter en bloc ?`,
    default: true,
  });
}

function elevationDeclined(
  adminSelection: SelectedPackage[],
): OutcomeWithProvider[] {
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

function providerIdOf(target: string): string {
  const idx = target.indexOf(":");
  return idx === -1 ? "" : target.slice(0, idx);
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
  writeGroup(
    skipped,
    chalk.yellow,
    `SKIP ${skipped.length} action(s) manuelle(s) requise(s):\n`,
  );
  writeGroup(failed, chalk.red, `FAIL ${failed.length}/${outcomes.length} échec(s):\n`);
  return failed.length === 0 ? 0 : 1;
}

/** Coloured header, then one `- <id> — <message>` line per entry. */
function writeGroup(
  outcomes: UpdateOutcome[],
  color: (s: string) => string,
  header: string,
): void {
  if (outcomes.length === 0) return;
  process.stdout.write(color(header));
  for (const o of outcomes) {
    const detail = o.message ? chalk.dim(` — ${o.message}`) : "";
    process.stdout.write(color(`     - ${o.id}`) + detail + "\n");
  }
}
