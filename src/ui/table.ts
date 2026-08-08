import Table from "cli-table3";
import chalk from "chalk";
import { ALL_PROVIDERS } from "../core/registry.js";
import type { ProviderScanResult } from "../core/types.js";

function providerName(id: string): string {
  return ALL_PROVIDERS.find((p) => p.id === id)?.displayName ?? id;
}

function newScanTable(): Table.Table {
  return new Table({
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
}

/** A provider's rows: either its scan error, or one line per package. */
function scanRows(result: ProviderScanResult): string[][] {
  const name = chalk.cyan(providerName(result.providerId));
  if (result.error) {
    return [[name, chalk.red(`scan error: ${result.error}`), "", "", ""]];
  }
  return result.packages.map((pkg) => [
    name,
    pkg.name ?? pkg.id,
    chalk.yellow(pkg.current),
    chalk.green(pkg.latest),
    pkg.note ? chalk.gray(pkg.note) : "",
  ]);
}

export function renderScanTable(results: ProviderScanResult[]): string {
  const table = newScanTable();
  const sorted = [...results].sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );

  let total = 0;
  for (const result of sorted) {
    for (const row of scanRows(result)) table.push(row);
    if (!result.error) total += result.packages.length;
  }

  if (total === 0) {
    return chalk.green("  à jour — aucune mise à jour disponible");
  }
  const footer = chalk.bold(`${total} mise(s) à jour disponible(s)`);
  return `${table.toString()}\n  ${footer}`;
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
