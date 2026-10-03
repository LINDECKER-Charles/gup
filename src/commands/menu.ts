import chalk from "chalk";
import { ALL_PROVIDERS, detectAvailableProviders, getProvider } from "../core/registry.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";
import { applyEach, applyUpdate } from "../ui/apply-update.js";
import { MenuApp } from "../ui/app/menu-app.js";
import type { MenuController } from "../ui/app/menu-session.js";
import { maybeRetryFailures, type OutcomeWithProvider } from "../ui/retry-failed.js";
import { runScan } from "../ui/scan-progress.js";
import type { SelectedPackage } from "../core/types.js";
import { beginSkipSession } from "../ui/skip-controller.js";
import { dim, type MenuState } from "./menu-state.js";

/** `gup` with no subcommand: the full-screen interactive app. */
export async function menuCommand(): Promise<number> {
  const state: MenuState = {
    scans: [],
    fast: false,
    filter: [],
    detectedCount: 0,
    providers: [],
  };
  await new MenuApp(menuController, state).run();
  return 0;
}

/** What the app needs from gup's core: scanning, provider status, updates. */
export const menuController: MenuController = {
  async scan(state, events) {
    const run = await runScan(
      { fast: state.fast, ...(state.filter.length > 0 && { only: state.filter }) },
      events,
    );
    state.scans = run.results;
    state.detectedCount = run.detected.length;
    state.providers = run.detected.map((p) => ({ id: p.id, displayName: p.displayName }));
  },

  async providersStatus() {
    const detected = await detectAvailableProviders();
    const ids = new Set(detected.map((p) => p.id));
    return {
      detected: detected.map(info),
      missing: ALL_PROVIDERS.filter((p) => !ids.has(p.id)).map(info),
    };
  },

  async updatePackages(packages) {
    const entries = await applyGrouped(groupByProvider(packages));
    summarize(await maybeRetryFailures(entries));
  },

  async updateTargets(targets) {
    const entries: OutcomeWithProvider[] = [];
    const session = beginSkipSession();
    try {
      for (const target of targets) {
        if (session.isAbortRequested()) break;
        const parsed = parseTarget(target);
        if (!parsed) continue;
        printSectionHeader(`${parsed.provider.displayName} : ${parsed.packageId}`, 1);
        const outcome = await applyUpdate(parsed.provider, parsed.packageId);
        entries.push({ providerId: parsed.provider.id, outcome });
      }
    } finally {
      session.dispose();
    }
    summarize(await maybeRetryFailures(entries));
  },

  validateTargets(raw) {
    const targets = raw.split(/[\s,]+/).filter(Boolean);
    if (targets.length === 0) return "saisir au moins une cible";
    const invalid = targets.find((t) => !parseTarget(t, { quiet: true }));
    return invalid ? `cible invalide : ${invalid} (format provider:package)` : true;
  },

  displayName(providerId) {
    return getProvider(providerId)?.displayName ?? providerId;
  },
};

function info(p: Provider) {
  return {
    id: p.id,
    displayName: p.displayName,
    ...(p.installHint && { installHint: p.installHint }),
  };
}

function groupByProvider(packages: readonly SelectedPackage[]): Map<string, OutdatedPackage[]> {
  const grouped = new Map<string, OutdatedPackage[]>();
  for (const { providerId, pkg } of packages) {
    grouped.set(providerId, [...(grouped.get(providerId) ?? []), pkg]);
  }
  return grouped;
}

/**
 * Run a provider→packages map one package at a time, under a skip session so a
 * timed-out / Ctrl+C'd install is skipped and the batch continues.
 */
async function applyGrouped(
  grouped: Map<string, OutdatedPackage[]>,
): Promise<OutcomeWithProvider[]> {
  const entries: OutcomeWithProvider[] = [];
  const session = beginSkipSession();
  try {
    for (const [providerId, pkgs] of grouped) {
      const provider = getProvider(providerId);
      if (!provider) continue;
      printSectionHeader(provider.displayName, pkgs.length);
      const done = await applyEach(provider, pkgs, session);
      entries.push(...done.map((outcome) => ({ providerId, outcome })));
      if (session.isAbortRequested()) break;
    }
  } finally {
    session.dispose();
  }
  return entries;
}

interface ParsedTarget {
  provider: Provider;
  packageId: string;
}

/** Split `provider:packageId` and resolve the provider, or report why not. */
function parseTarget(target: string, opts: { quiet?: boolean } = {}): ParsedTarget | null {
  const idx = target.indexOf(":");
  const provider = idx > 0 ? getProvider(target.slice(0, idx)) : undefined;
  const packageId = target.slice(idx + 1);
  if (provider && packageId) return { provider, packageId };
  if (!opts.quiet) {
    const reason = idx === -1 ? "format invalide" : "provider inconnu";
    process.stderr.write(chalk.red(`  ${reason}: ${target}\n`));
  }
  return null;
}

function summarize(outcomes: UpdateOutcome[]): void {
  if (outcomes.length === 0) return;
  const succeeded = outcomes.filter((o) => o.success);
  const skipped = outcomes.filter((o) => !o.success && o.skipped);
  const failed = outcomes.filter((o) => !o.success && !o.skipped);

  process.stdout.write("\n");
  if (succeeded.length > 0) {
    process.stdout.write(chalk.green(`  OK   ${succeeded.length} mise(s) à jour effectuée(s)\n`));
  }
  writeGroup(skipped, chalk.yellow, `  SKIP ${skipped.length} action(s) manuelle(s) requise(s)\n`);
  writeGroup(failed, chalk.red, `  FAIL ${failed.length}/${outcomes.length} échec(s)\n`);
}

/** Coloured header, then one `- <id> — <message>` line per entry. */
function writeGroup(outcomes: UpdateOutcome[], color: (s: string) => string, header: string): void {
  if (outcomes.length === 0) return;
  process.stdout.write(color(header));
  for (const o of outcomes) {
    const detail = o.message ? chalk.dim(` — ${o.message}`) : "";
    process.stdout.write(color(`       - ${o.id}`) + detail + "\n");
  }
}

function printSectionHeader(label: string, count: number): void {
  process.stdout.write(`\n${chalk.bold(`  → ${label}`)} ${dim(`(${count})`)}\n`);
}
