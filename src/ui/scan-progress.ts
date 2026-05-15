import chalk from "chalk";
import ora from "ora";
import type { Provider, ProviderScanResult } from "../core/types.js";
import { getProvidersToScan, scanAll, type ScanOptions } from "../core/registry.js";

/**
 * Runs scanAll with a live spinner showing currently-scanning providers and
 * a [done/total] counter. Caps the displayed in-flight list at 3 names so
 * the line stays readable; remaining are summarized as "+N".
 */
export async function scanWithProgress(
  baseOptions: Omit<ScanOptions, "onProviderStart" | "onProviderEnd"> = {},
): Promise<ProviderScanResult[]> {
  const planned = await getProvidersToScan(baseOptions);
  const total = planned.length;

  if (total === 0) {
    process.stdout.write(chalk.dim("  aucun provider disponible\n"));
    return [];
  }

  const spinner = ora({
    text: chalk.dim(`scan [0/${total}]`),
    spinner: "line",
  }).start();

  const inFlight = new Set<string>();
  let done = 0;
  const startedAt = Date.now();

  const render = (): void => {
    const active = [...inFlight];
    let suffix = "";
    if (active.length > 0) {
      const head = active.slice(0, 3);
      const overflow = active.length - head.length;
      suffix =
        chalk.dim(" — ") +
        head.join(chalk.dim(" · ")) +
        (overflow > 0 ? chalk.dim(` +${overflow}`) : "");
    }
    spinner.text = chalk.dim(`scan [${done}/${total}]`) + suffix;
  };

  const results = await scanAll({
    ...baseOptions,
    onProviderStart: (provider: Provider) => {
      inFlight.add(provider.displayName);
      render();
    },
    onProviderEnd: (provider: Provider, result: ProviderScanResult) => {
      inFlight.delete(provider.displayName);
      done++;
      // Hold the failure briefly so it's visible before the next render.
      if (result.error) {
        spinner.text =
          chalk.dim(`scan [${done}/${total}] — `) +
          chalk.red(`${provider.displayName}: ${result.error}`);
      } else {
        render();
      }
    },
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const updates = results.reduce((n, r) => n + r.packages.length, 0);
  spinner.stopAndPersist({
    symbol: chalk.dim("·"),
    text: chalk.dim(
      `scan terminé en ${elapsed}s — ${total} provider(s), ${updates} mise(s) à jour`,
    ),
  });

  return results;
}
