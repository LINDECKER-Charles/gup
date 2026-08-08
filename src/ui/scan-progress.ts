import chalk from "chalk";
import ora, { type Ora } from "ora";
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
  const total = countPlanned(detected, baseOptions);
  if (total === 0) {
    const text = chalk.dim("aucun provider disponible");
    spinner.stopAndPersist({ symbol: chalk.dim("·"), text });
    return { results: [], detectedCount: detected.length };
  }

  spinner.text = chalk.dim(`scan [0/${total}]`);
  const startedAt = Date.now();

  const results = await scanAll({
    ...baseOptions,
    detected,
    ...progressCallbacks(spinner, total),
  });

  reportScanDone(spinner, { results, total, startedAt });
  return { results, detectedCount: detected.length };
}

function reportScanDone(
  spinner: Ora,
  run: { results: ProviderScanResult[]; total: number; startedAt: number },
): void {
  const elapsed = ((Date.now() - run.startedAt) / 1000).toFixed(1);
  const updates = run.results.reduce((n, r) => n + r.packages.length, 0);
  spinner.stopAndPersist({
    symbol: chalk.dim("·"),
    text: chalk.dim(
      `scan terminé en ${elapsed}s — ${run.total} provider(s), ${updates} mise(s) à jour`,
    ),
  });
}

/**
 * Callbacks de progression pour `scanAll`. Elles referment sur le compteur et
 * l'ensemble des providers en vol, pour que l'appelant n'ait pas à les porter.
 */
function progressCallbacks(spinner: Ora, total: number) {
  const inFlight = new Set<string>();
  let done = 0;
  const render = (): void => {
    spinner.text = chalk.dim(`scan [${done}/${total}]`) + inFlightSuffix(inFlight);
  };

  return {
    onProviderStart: (provider: Provider) => {
      inFlight.add(provider.displayName);
      render();
    },
    onProviderEnd: (provider: Provider, result: ProviderScanResult) => {
      inFlight.delete(provider.displayName);
      done++;
      // Hold the failure briefly so it's visible before the next render.
      if (!result.error) return render();
      spinner.text =
        chalk.dim(`scan [${done}/${total}] — `) +
        chalk.red(`${provider.displayName}: ${result.error}`);
    },
  };
}

/** Combien de providers détectés survivent aux filtres `only` / `fast`. */
function countPlanned(
  detected: Provider[],
  options: Pick<ScanOptions, "only" | "fast">,
): number {
  return detected.filter((p) => {
    if (options.only?.length && !options.only.includes(p.id)) return false;
    if (options.fast && p.slow) return false;
    return true;
  }).length;
}

/** « — a · b · c +2 » : les providers en cours, tronqués à trois. */
function inFlightSuffix(inFlight: Set<string>): string {
  const active = [...inFlight];
  if (active.length === 0) return "";
  const head = active.slice(0, 3);
  const overflow = active.length - head.length;
  return (
    chalk.dim(" — ") +
    head.join(chalk.dim(" · ")) +
    (overflow > 0 ? chalk.dim(` +${overflow}`) : "")
  );
}
