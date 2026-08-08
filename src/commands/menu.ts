import { select, input, confirm, Separator } from "@inquirer/prompts";
import chalk from "chalk";
import {
  ALL_PROVIDERS,
  detectAvailableProviders,
  getProvider,
} from "../core/registry.js";
import { promptPackageSelection } from "../ui/select.js";
import { renderScanTable, renderProvidersStatus } from "../ui/table.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import {
  maybeRetryFailures,
  type OutcomeWithProvider,
} from "../ui/retry-failed.js";
import { applyEach, applyUpdate } from "../ui/apply-update.js";
import { beginSkipSession } from "../ui/skip-controller.js";
import { gupVersion } from "../core/version.js";
import { runOptions } from "./menu-options.js";
import { dim, pad, type MenuState } from "./menu-state.js";
import type {
  OutdatedPackage,
  Provider,
  UpdateOutcome,
} from "../core/types.js";


type MenuAction =
  | "scan"
  | "review"
  | "select"
  | "all"
  | "target"
  | "doctor"
  | "options"
  | "quit";

export async function menuCommand(): Promise<number> {
  const state: MenuState = {
    scans: [],
    fast: false,
    filter: [],
    detectedCount: 0,
  };

  printHeader();
  await initialScan(state);

  for (;;) {
    printStatus(state);
    const action = await select<MenuAction>({
      message: "Action",
      choices: mainMenuChoices(totalUpdates(state)),
      pageSize: 14,
      loop: false,
    });
    if (action === "quit") return 0;
    await runAction(action, state);
  }
}

function mainMenuChoices(total: number) {
  const noUpdate = total === 0 ? dim("aucune mise à jour") : false;
  return [
    { name: pad("Scan", "rescanne tous les providers"), value: "scan" as const },
    {
      name: pad("Review", "voir la liste détaillée"),
      value: "review" as const,
      disabled: noUpdate,
    },
    {
      name: pad("Update selected", "choix multiple"),
      value: "select" as const,
      disabled: noUpdate,
    },
    {
      name: pad("Update all", `${total} paquet(s)`),
      value: "all" as const,
      disabled: noUpdate,
    },
    new Separator(dim("  ─")),
    { name: pad("Update target", "provider:package"), value: "target" as const },
    { name: pad("Providers", "status / install hints"), value: "doctor" as const },
    {
      name: pad("Options", "fast mode, filtre providers"),
      value: "options" as const,
    },
    new Separator(dim("  ─")),
    { name: pad("Quit", ""), value: "quit" as const },
  ];
}

async function runAction(
  action: Exclude<MenuAction, "quit">,
  state: MenuState,
): Promise<void> {
  switch (action) {
    case "scan":
      return initialScan(state);
    case "review":
      process.stdout.write(`\n${renderScanTable(state.scans)}\n`);
      return;
    case "select":
      return runSelect(state);
    case "all":
      return runAll(state);
    case "target":
      return runTarget();
    case "doctor":
      return runDoctor();
    case "options":
      return runOptions(state);
  }
}

function printHeader(): void {
  const title = chalk.bold("gup");
  const sub = chalk.dim("global updater");
  const version = chalk.dim(`v${gupVersion()}`);
  const line = chalk.dim("─".repeat(60));
  process.stdout.write(`\n  ${title}  ${sub}${" ".repeat(40 - "global updater".length)}${version}\n`);
  process.stdout.write(`  ${line}\n`);
}

function printStatus(state: MenuState): void {
  const total = totalUpdates(state);
  const providerLine = `${state.detectedCount} provider(s) détecté(s)`;
  const updateLine =
    total === 0
      ? chalk.green("à jour")
      : chalk.yellow(`${total} mise(s) à jour disponible(s)`);
  const filterLabel =
    state.filter.length === 0 ? "tous" : state.filter.join(", ");
  const modeLine = `${state.fast ? "fast" : "normal"}  ·  ${filterLabel}`;

  process.stdout.write("\n");
  process.stdout.write(`  ${dim("status".padEnd(8))} ${providerLine}  ·  ${updateLine}\n`);
  process.stdout.write(`  ${dim("mode".padEnd(8))} ${chalk.dim(modeLine)}\n\n`);
}

async function initialScan(state: MenuState): Promise<void> {
  const { results, detectedCount } = await scanWithProgress({
    fast: state.fast,
    ...(state.filter.length > 0 && { only: state.filter }),
  });
  state.scans = results;
  state.detectedCount = detectedCount;
}

async function runSelect(state: MenuState): Promise<void> {
  const selection = await promptPackageSelection(state.scans);
  if (selection.length === 0) {
    process.stdout.write(dim("  aucune sélection\n"));
    return;
  }
  const ok = await confirm({
    message: `Appliquer ${selection.length} mise(s) à jour ?`,
    default: true,
  });
  if (!ok) return;

  const grouped = new Map<string, OutdatedPackage[]>();
  for (const sel of selection) {
    const list = grouped.get(sel.providerId) ?? [];
    list.push(sel.pkg);
    grouped.set(sel.providerId, list);
  }

  const entries = await applyGrouped(grouped);
  const outcomes = await maybeRetryFailures(entries);
  summarize(outcomes);
  await initialScan(state);
}

/**
 * Run a provider→packages map one package at a time, under a skip session so a
 * timed-out / Ctrl+C'd install is skipped and the batch continues. Shared by
 * "Update selected" and "Update all".
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

async function runAll(state: MenuState): Promise<void> {
  const total = totalUpdates(state);
  const ok = await confirm({
    message: `Mettre à jour les ${total} paquet(s) ?`,
    default: true,
  });
  if (!ok) return;

  const grouped = new Map<string, OutdatedPackage[]>();
  for (const scan of state.scans) {
    if (scan.packages.length === 0) continue;
    grouped.set(scan.providerId, scan.packages);
  }

  const entries = await applyGrouped(grouped);
  const outcomes = await maybeRetryFailures(entries);
  summarize(outcomes);
  await initialScan(state);
}

async function runTarget(): Promise<void> {
  const raw = await input({
    message: "Cible(s) [provider:packageId, espace/virgule]",
    validate: (v) => v.trim().length > 0 || "saisir au moins une cible",
  });
  const targets = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const entries: OutcomeWithProvider[] = [];
  const session = beginSkipSession();
  try {
    for (const target of targets) {
      if (session.isAbortRequested()) break;
      const parsed = parseTarget(target);
      if (!parsed) continue;
      const { providerId, provider, packageId } = parsed;
      printSectionHeader(`${provider.displayName} : ${packageId}`, 1);
      entries.push({ providerId, outcome: await applyUpdate(provider, packageId) });
    }
  } finally {
    session.dispose();
  }
  const outcomes = await maybeRetryFailures(entries);
  summarize(outcomes);
}

interface ParsedTarget {
  providerId: string;
  provider: Provider;
  packageId: string;
}

/** Split `provider:packageId` and resolve the provider, or report why not. */
function parseTarget(target: string): ParsedTarget | null {
  const idx = target.indexOf(":");
  if (idx === -1) {
    process.stderr.write(chalk.red(`  format invalide: ${target}\n`));
    return null;
  }
  const providerId = target.slice(0, idx);
  const provider = getProvider(providerId);
  if (!provider) {
    process.stderr.write(chalk.red(`  provider inconnu: ${providerId}\n`));
    return null;
  }
  return { providerId, provider, packageId: target.slice(idx + 1) };
}

async function runDoctor(): Promise<void> {
  const detected = (await detectAvailableProviders()).map((p) => p.id);
  const missing = ALL_PROVIDERS.filter((p) => !detected.includes(p.id)).map(
    (p) => ({
      id: p.id,
      displayName: p.displayName,
      ...(p.installHint && { installHint: p.installHint }),
    }),
  );
  process.stdout.write(`\n${renderProvidersStatus(detected, missing)}\n`);
}

function summarize(outcomes: UpdateOutcome[]): void {
  if (outcomes.length === 0) return;
  const succeeded = outcomes.filter((o) => o.success);
  const skipped = outcomes.filter((o) => !o.success && o.skipped);
  const failed = outcomes.filter((o) => !o.success && !o.skipped);

  process.stdout.write("\n");
  if (succeeded.length > 0) {
    process.stdout.write(
      chalk.green(`  OK   ${succeeded.length} mise(s) à jour effectuée(s)\n`),
    );
  }
  writeGroup(
    skipped,
    chalk.yellow,
    `  SKIP ${skipped.length} action(s) manuelle(s) requise(s)\n`,
  );
  writeGroup(failed, chalk.red, `  FAIL ${failed.length}/${outcomes.length} échec(s)\n`);
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
    process.stdout.write(color(`       - ${o.id}`) + detail + "\n");
  }
}

function printSectionHeader(label: string, count: number): void {
  process.stdout.write(`\n${chalk.bold(`  → ${label}`)} ${dim(`(${count})`)}\n`);
}

function totalUpdates(state: MenuState): number {
  return state.scans.reduce((sum, s) => sum + s.packages.length, 0);
}

