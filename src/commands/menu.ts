import { select, input, confirm, checkbox, Separator } from "@inquirer/prompts";
import chalk from "chalk";
import {
  ALL_PROVIDERS,
  detectAvailableProviders,
  getProvider,
} from "../core/registry.js";
import { promptPackageSelection } from "../ui/select.js";
import { renderScanTable, renderProvidersStatus } from "../ui/table.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import type {
  OutdatedPackage,
  ProviderScanResult,
  UpdateOutcome,
} from "../core/types.js";

const VERSION = "0.1.0";

interface MenuState {
  scans: ProviderScanResult[];
  fast: boolean;
  filter: string[];
  detectedCount: number;
}

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

    const total = totalUpdates(state);
    const action = await select<MenuAction>({
      message: "Action",
      choices: [
        { name: pad("Scan", "rescanne tous les providers"), value: "scan" },
        {
          name: pad("Review", "voir la liste détaillée"),
          value: "review",
          disabled: total === 0 ? dim("aucune mise à jour") : false,
        },
        {
          name: pad("Update selected", "choix multiple"),
          value: "select",
          disabled: total === 0 ? dim("aucune mise à jour") : false,
        },
        {
          name: pad("Update all", `${total} paquet(s)`),
          value: "all",
          disabled: total === 0 ? dim("aucune mise à jour") : false,
        },
        new Separator(dim("  ─")),
        {
          name: pad("Update target", "provider:package"),
          value: "target",
        },
        { name: pad("Providers", "status / install hints"), value: "doctor" },
        { name: pad("Options", "fast mode, filtre providers"), value: "options" },
        new Separator(dim("  ─")),
        { name: pad("Quit", ""), value: "quit" },
      ],
      pageSize: 14,
      loop: false,
    });

    switch (action) {
      case "scan":
        await initialScan(state);
        break;
      case "review":
        process.stdout.write(`\n${renderScanTable(state.scans)}\n`);
        break;
      case "select":
        await runSelect(state);
        break;
      case "all":
        await runAll(state);
        break;
      case "target":
        await runTarget();
        break;
      case "doctor":
        await runDoctor();
        break;
      case "options":
        await runOptions(state);
        break;
      case "quit":
        return 0;
    }
  }
}

function printHeader(): void {
  const title = chalk.bold("gup");
  const sub = chalk.dim("global updater");
  const version = chalk.dim(`v${VERSION}`);
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
  if (state.detectedCount === 0) {
    state.detectedCount = (await detectAvailableProviders()).length;
  }
  state.scans = await scanWithProgress({
    fast: state.fast,
    ...(state.filter.length > 0 && { only: state.filter }),
  });
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

  const outcomes: UpdateOutcome[] = [];
  for (const [providerId, pkgs] of grouped) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    printSectionHeader(provider.displayName, pkgs.length);
    if (pkgs.length === 1) {
      outcomes.push(await provider.update(pkgs[0]!.id));
    } else {
      outcomes.push(...(await provider.updateAll(pkgs)));
    }
  }
  summarize(outcomes);
  await initialScan(state);
}

async function runAll(state: MenuState): Promise<void> {
  // Partition automatable vs known-manual upfront so the user sees exactly
  // what "Update all" will do, instead of discovering 100 SKIPs after the fact.
  let automatable = 0;
  let manual = 0;
  const manualEntries: Array<{ provider: string; pkg: OutdatedPackage }> = [];
  for (const scan of state.scans) {
    for (const pkg of scan.packages) {
      if (pkg.manual) {
        manual++;
        manualEntries.push({ provider: scan.providerId, pkg });
      } else {
        automatable++;
      }
    }
  }

  if (automatable === 0 && manual > 0) {
    process.stdout.write(
      chalk.yellow(
        `\n  ${manual} mise(s) à jour disponible(s) mais toutes nécessitent une action manuelle.\n`,
      ),
    );
    printManualList(manualEntries);
    return;
  }

  let message = `Tout mettre à jour (${automatable} paquet(s) automatisable(s)`;
  if (manual > 0) message += `, ${manual} ignoré(s) — action manuelle`;
  message += ") ?";

  const ok = await confirm({ message, default: true });
  if (!ok) return;

  const outcomes: UpdateOutcome[] = [];
  for (const scan of state.scans) {
    const actionable = scan.packages.filter((p) => !p.manual);
    if (actionable.length === 0) continue;
    const provider = getProvider(scan.providerId);
    if (!provider) continue;
    printSectionHeader(provider.displayName, actionable.length);
    outcomes.push(...(await provider.updateAll(actionable)));
  }
  summarize(outcomes);

  if (manual > 0) {
    process.stdout.write(
      chalk.yellow(`\n  ${manual} action(s) manuelle(s) à faire toi-même :\n`),
    );
    printManualList(manualEntries);
  }

  await initialScan(state);
}

function printManualList(
  entries: Array<{ provider: string; pkg: OutdatedPackage }>,
): void {
  for (const entry of entries) {
    const provider = getProvider(entry.provider);
    const label = provider?.displayName ?? entry.provider;
    const name = entry.pkg.name ?? entry.pkg.id;
    const note = entry.pkg.note ? chalk.dim(` — ${entry.pkg.note}`) : "";
    process.stdout.write(
      chalk.dim(`       · `) + `${name} ${chalk.dim(`(${label})`)}${note}\n`,
    );
  }
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

  const outcomes: UpdateOutcome[] = [];
  for (const target of targets) {
    const idx = target.indexOf(":");
    if (idx === -1) {
      process.stderr.write(chalk.red(`  format invalide: ${target}\n`));
      continue;
    }
    const providerId = target.slice(0, idx);
    const packageId = target.slice(idx + 1);
    const provider = getProvider(providerId);
    if (!provider) {
      process.stderr.write(chalk.red(`  provider inconnu: ${providerId}\n`));
      continue;
    }
    printSectionHeader(`${provider.displayName} : ${packageId}`, 1);
    outcomes.push(await provider.update(packageId));
  }
  summarize(outcomes);
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

type OptionAction = "fast" | "filter" | "back";

async function runOptions(state: MenuState): Promise<void> {
  const choice = await select<OptionAction>({
    message: "Options",
    choices: [
      {
        name: pad(
          `Fast mode  [${state.fast ? "ON" : "OFF"}]`,
          "skip pwsh-modules & vscode-ext",
        ),
        value: "fast",
      },
      {
        name: pad(
          "Filtre providers",
          state.filter.length === 0 ? "tous" : state.filter.join(", "),
        ),
        value: "filter",
      },
      new Separator(dim("  ─")),
      { name: pad("Retour", ""), value: "back" },
    ],
    loop: false,
  });

  if (choice === "fast") {
    state.fast = !state.fast;
    process.stdout.write(
      dim(`  fast mode ${state.fast ? "activé" : "désactivé"} — rescanne pour appliquer\n`),
    );
  } else if (choice === "filter") {
    const available = await detectAvailableProviders();
    state.filter = await checkbox<string>({
      message: "Providers à inclure (vide = tous)",
      choices: available.map((p) => ({
        name: `${p.displayName.padEnd(22)} ${dim(`(${p.id})`)}`,
        value: p.id,
        checked: state.filter.length === 0 ? false : state.filter.includes(p.id),
      })),
      loop: false,
      pageSize: 12,
    });
    process.stdout.write(
      dim(
        `  filtre: ${state.filter.length === 0 ? "tous" : state.filter.join(", ")} — rescanne pour appliquer\n`,
      ),
    );
  }
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
  if (skipped.length > 0) {
    process.stdout.write(
      chalk.yellow(`  SKIP ${skipped.length} action(s) manuelle(s) requise(s)\n`),
    );
    for (const s of skipped) {
      process.stdout.write(
        chalk.yellow(`       - ${s.id}`) +
          (s.message ? chalk.dim(` — ${s.message}`) : "") +
          "\n",
      );
    }
  }
  if (failed.length > 0) {
    process.stdout.write(
      chalk.red(`  FAIL ${failed.length}/${outcomes.length} échec(s)\n`),
    );
    for (const f of failed) {
      process.stdout.write(
        chalk.red(`       - ${f.id}`) +
          (f.message ? chalk.dim(` — ${f.message}`) : "") +
          "\n",
      );
    }
  }
}

function printSectionHeader(label: string, count: number): void {
  process.stdout.write(`\n${chalk.bold(`  → ${label}`)} ${dim(`(${count})`)}\n`);
}

function totalUpdates(state: MenuState): number {
  return state.scans.reduce((sum, s) => sum + s.packages.length, 0);
}

function pad(label: string, hint: string): string {
  const padded = label.padEnd(22);
  return hint ? `${padded} ${dim(hint)}` : padded;
}

function dim(s: string): string {
  return chalk.dim(s);
}
