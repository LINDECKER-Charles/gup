import chalk from "chalk";
import type { Provider, ProviderScanResult } from "../core/types.js";
import { recordScan } from "../core/history/store.js";
import {
  detectAvailableProviders,
  scanAll,
  type ScanOptions,
} from "../core/registry.js";
import { canPrompt } from "./tui/prompt-host.js";
import { SILENT_PROGRESS, withScanView, type ScanProgress } from "./tui/scan-view.js";

export interface ScanWithProgressResult {
  results: ProviderScanResult[];
  /** Total number of providers detected on the system, before `only`/`fast` filtering. */
  detectedCount: number;
}

type BaseScanOptions = Omit<ScanOptions, "onProviderStart" | "onProviderEnd">;

interface ScanRun extends ScanWithProgressResult {
  planned: number;
  elapsedMs: number;
}

/**
 * Runs detection then scanAll under a live progress band (in a terminal):
 * a [done/total] counter, the providers currently scanning and the latest
 * failure. Detection gets its own phase because probing every provider's
 * `isAvailable()` takes a noticeable moment. Once the band is gone, a single
 * summary line stays in the scrollback; piped or redirected, only that line
 * is written.
 */
export async function scanWithProgress(
  baseOptions: BaseScanOptions = {},
): Promise<ScanWithProgressResult> {
  const work = (progress: ScanProgress): Promise<ScanRun> => detectAndScan(baseOptions, progress);
  const run = canPrompt() ? await withScanView(work) : await work(SILENT_PROGRESS);
  reportScanDone(run);
  return { results: run.results, detectedCount: run.detectedCount };
}

async function detectAndScan(
  baseOptions: BaseScanOptions,
  progress: ScanProgress,
): Promise<ScanRun> {
  progress.detecting();
  const detected = await detectAvailableProviders();
  const planned = countPlanned(detected, baseOptions);
  if (planned === 0) {
    return { results: [], detectedCount: detected.length, planned, elapsedMs: 0 };
  }

  const startedAt = Date.now();
  const results = await scanAll({
    ...baseOptions,
    detected,
    ...progressCallbacks(progress, planned),
  });
  const elapsedMs = Date.now() - startedAt;
  recordScan({ results, durationMs: elapsedMs, options: baseOptions });
  return { results, detectedCount: detected.length, planned, elapsedMs };
}

function reportScanDone({ results, planned, elapsedMs }: ScanRun): void {
  if (planned === 0) {
    process.stdout.write(chalk.dim("·  aucun provider disponible\n"));
    return;
  }
  const elapsed = (elapsedMs / 1000).toFixed(1);
  const updates = results.reduce((n, r) => n + r.packages.length, 0);
  process.stdout.write(
    `${chalk.green("◇")}  ${chalk.dim(
      `scan terminé en ${elapsed}s — ${planned} provider(s), ${updates} mise(s) à jour`,
    )}\n`,
  );
}

/**
 * Progress callbacks for `scanAll`. They close over the counter, the set of
 * in-flight providers and the latest failure, so the caller does not have to
 * carry them.
 */
function progressCallbacks(progress: ScanProgress, total: number) {
  const inFlight = new Set<string>();
  let done = 0;
  let lastError: string | undefined;
  const report = (): void =>
    progress.scanning({ done, total, inFlight: [...inFlight], ...(lastError && { lastError }) });

  return {
    onProviderStart: (provider: Provider) => {
      inFlight.add(provider.displayName);
      report();
    },
    onProviderEnd: (provider: Provider, result: ProviderScanResult) => {
      inFlight.delete(provider.displayName);
      done++;
      if (result.error) lastError = `${provider.displayName} : ${result.error}`;
      report();
    },
  };
}

/** How many detected providers survive the `only` / `fast` filters. */
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
