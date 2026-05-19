import chalk from "chalk";
import ora from "ora";
import type { Provider, ProviderScanResult } from "../core/types.js";
import {
  detectAvailableProviders,
  scanAll,
  type ScanOptions,
} from "../core/registry.js";

export interface ScanWithProgressResult {
  results: ProviderScanResult[];
  /** Total number of providers detected on the system, before `only`/`fast` filtering. */
  detectedCount: number;
}

/**
 * Runs scanAll with a live spinner showing currently-scanning providers and
 * a [done/total] counter. Caps the displayed in-flight list at 3 names so
 * the line stays readable; remaining are summarized as "+N".
 *
 * Detection itself can take a noticeable amount of time (probing every
 * provider's `isAvailable()`), so we surface a dedicated spinner phase
 * before the scan kicks in.
 */
export async function scanWithProgress(
  baseOptions: Omit<ScanOptions, "onProviderStart" | "onProviderEnd"> = {},
): Promise<ScanWithProgressResult> {
  const spinner = ora({
    text: chalk.dim("détection des providers…"),
    spinner: "line",
  }).start();

  const detected = await detectAvailableProviders();
  const planned = detected.filter((p) => {
    if (baseOptions.only?.length && !baseOptions.only.includes(p.id)) return false;
    if (baseOptions.fast && p.slow) return false;
    return true;
  });
  const total = planned.length;

  if (total === 0) {
    spinner.stopAndPersist({
      symbol: chalk.dim("·"),
      text: chalk.dim("aucun provider disponible"),
    });
    return { results: [], detectedCount: detected.length };
  }

  spinner.text = chalk.dim(`scan [0/${total}]`);

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
    detected,
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

  return { results, detectedCount: detected.length };
}
