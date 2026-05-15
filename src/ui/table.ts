import Table from "cli-table3";
import chalk from "chalk";
import { ALL_PROVIDERS } from "../core/registry.js";
import type { ProviderScanResult } from "../core/types.js";

export function renderScanTable(results: ProviderScanResult[]): string {
  const table = new Table({
    head: [
      chalk.bold("Provider"),
      chalk.bold("Package"),
      chalk.bold("Current"),
      chalk.bold("Latest"),
      chalk.bold("Note"),
    ],
    style: { head: [], border: ["gray"] },
    wordWrap: true,
  });

  const providerName = (id: string): string =>
    ALL_PROVIDERS.find((p) => p.id === id)?.displayName ?? id;

  const sorted = [...results].sort((a, b) => a.providerId.localeCompare(b.providerId));
  let total = 0;

  for (const result of sorted) {
    if (result.error) {
      table.push([
        chalk.cyan(providerName(result.providerId)),
        chalk.red(`scan error: ${result.error}`),
        "",
        "",
        "",
      ]);
      continue;
    }
    if (result.packages.length === 0) continue;
    total += result.packages.length;
    for (const pkg of result.packages) {
      table.push([
        chalk.cyan(providerName(result.providerId)),
        pkg.name ?? pkg.id,
        chalk.yellow(pkg.current),
        chalk.green(pkg.latest),
        pkg.note ? chalk.gray(pkg.note) : "",
      ]);
    }
  }

  if (total === 0) {
    return chalk.green("  à jour — aucune mise à jour disponible");
  }
  return `${table.toString()}\n  ${chalk.bold(`${total} mise(s) à jour disponible(s)`)}`;
}

export function renderProvidersStatus(
  detected: string[],
  missing: Array<{ id: string; displayName: string; installHint?: string }>,
): string {
  const lines: string[] = [];
  lines.push(chalk.bold("  Providers détectés"));
  lines.push(chalk.dim(`  ${"─".repeat(40)}`));
  for (const id of detected) {
    const p = ALL_PROVIDERS.find((x) => x.id === id);
    lines.push(
      `  ${chalk.green("●")} ${(p?.displayName ?? id).padEnd(24)} ${chalk.dim(`(${id})`)}`,
    );
  }
  if (missing.length > 0) {
    lines.push("");
    lines.push(chalk.bold("  Non installés / hors PATH"));
    lines.push(chalk.dim(`  ${"─".repeat(40)}`));
    for (const p of missing) {
      lines.push(
        `  ${chalk.gray("○")} ${p.displayName.padEnd(24)} ${chalk.dim(`(${p.id})`)}` +
          (p.installHint ? chalk.dim(`\n      → ${p.installHint}`) : ""),
      );
    }
  }
  return lines.join("\n");
}
