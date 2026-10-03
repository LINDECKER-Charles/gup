import chalk from "chalk";
import type { Provider, ProviderScanResult } from "../core/types.js";
import { recordScan } from "../core/history/store.js";
import { detectAvailableProviders, scanAll, type ScanOptions } from "../core/registry.js";
import { SILENT_SCAN, type ScanEvents, type ScanObserver } from "./panels/scan-panel.js";
import { withScanScreen } from "./prompts/scan-screen.js";
import { canPrompt } from "./tui/screen-host.js";

export interface ScanWithProgressResult {
  results: ProviderScanResult[];
  /** Total number of providers detected on the system, before `only`/`fast` filtering. */
  detectedCount: number;
}

export type BaseScanOptions = Omit<ScanOptions, "onProviderStart" | "onProviderEnd">;

export interface ScanRun {
  results: ProviderScanResult[];
  /** Every provider detected on the machine, before `only`/`fast` filtering. */
  detected: Provider[];
  planned: number;
  elapsedMs: number;
}

/**
 * Detection then scanAll, reporting each step to `events`: the phase change,
 * the planned count, and every provider as it starts and finishes. Records
 * the scan in the history. Shared by the menu and the one-shot commands.
 */
export async function runScan(options: BaseScanOptions, events: ScanEvents): Promise<ScanRun> {
  events.detecting();
  const detected = await detectAvailableProviders();
  const planned = countPlanned(detected, options);
  events.planned(planned);
  const startedAt = Date.now();
  const started = new Map<string, number>();
  const results =
    planned === 0
      ? []
      : await scanAll({
          ...options,
          detected,
          onProviderStart: (p) => {
            started.set(p.id, Date.now());
            events.started(p.displayName);
          },
          onProviderEnd: (p, r) => events.finished(p.displayName, outcomeOf(r, started.get(p.id))),
        });
  const elapsedMs = Date.now() - startedAt;
  if (planned > 0) recordScan({ results, durationMs: elapsedMs, options });
  events.completed(elapsedMs);
  return { results, detected, planned, elapsedMs };
}

/**
 * `runScan` for the one-shot commands: on a terminal, under a full-screen
 * scan view; piped or redirected, silently. Either way one summary line is
 * left in the scrollback.
 */
export async function scanWithProgress(
  options: BaseScanOptions = {},
): Promise<ScanWithProgressResult> {
  const run = canPrompt()
    ? await withScanScreen((events) => runScan(options, events))
    : await runScan(options, SILENT_SCAN);
  reportScanDone(run);
  return { results: run.results, detectedCount: run.detected.length };
}

function outcomeOf(result: ProviderScanResult, startedAt: number | undefined) {
  const ms = startedAt === undefined ? 0 : Date.now() - startedAt;
  return { updates: result.packages.length, ms, ...(result.error && { error: result.error }) };
}

function reportScanDone({ results, planned, elapsedMs }: ScanRun): void {
  if (planned === 0) {
    process.stdout.write(chalk.dim("  aucun provider disponible\n"));
    return;
  }
  const elapsed = (elapsedMs / 1000).toFixed(1);
  const updates = results.reduce((n, r) => n + r.packages.length, 0);
  process.stdout.write(
    chalk.dim(
      `  scan terminé en ${elapsed}s — ${planned} provider(s), ${updates} mise(s) à jour\n`,
    ),
  );
}

/** How many detected providers survive the `only` / `fast` filters. */
function countPlanned(detected: Provider[], options: Pick<ScanOptions, "only" | "fast">): number {
  return detected.filter((p) => {
    if (options.only?.length && !options.only.includes(p.id)) return false;
    if (options.fast && p.slow) return false;
    return true;
  }).length;
}

/**
 * The session's scans, fanned out to the views: one scan at a time, its
 * progress to every observer (the Scan view draws it), then a "results
 * changed" notification once `state.scans` holds them (Paquets rebuilds its
 * table).
 */
export class ScanBus {
  readonly #scan: (events: ScanEvents) => Promise<void>;
  readonly #observers = new Set<ScanObserver>();
  readonly #resultListeners = new Set<() => void>();
  #isRunning = false;

  /** `scan` runs one scan, reporting to `events`, and stores its results. */
  constructor(scan: (events: ScanEvents) => Promise<void>) {
    this.#scan = scan;
  }

  get isRunning(): boolean {
    return this.#isRunning;
  }

  observe(observer: ScanObserver): () => void {
    this.#observers.add(observer);
    return () => void this.#observers.delete(observer);
  }

  onResults(listener: () => void): () => void {
    this.#resultListeners.add(listener);
    return () => void this.#resultListeners.delete(listener);
  }

  /**
   * One scan — none while another runs — then its results announced. A scan
   * that breaks (not one provider: the whole run) is reported as failed.
   */
  async run(): Promise<void> {
    if (this.#isRunning) return;
    this.#isRunning = true;
    try {
      await this.#scan(this.events());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const observer of this.#observers) observer.failed(message);
    } finally {
      this.#isRunning = false;
    }
    this.announceResults();
  }

  /** One animation frame to every observer. */
  tick(): void {
    for (const observer of this.#observers) observer.tick();
  }

  /** `state.scans` holds results the views have not seen. */
  announceResults(): void {
    for (const listener of [...this.#resultListeners]) listener();
  }

  private events(): ScanEvents {
    const each = (notify: (observer: ScanObserver) => void): void => {
      for (const observer of this.#observers) notify(observer);
    };
    return {
      detecting: () => each((o) => o.detecting()),
      planned: (total) => each((o) => o.planned(total)),
      started: (provider) => each((o) => o.started(provider)),
      finished: (provider, outcome) => each((o) => o.finished(provider, outcome)),
      completed: (elapsedMs) => each((o) => o.completed(elapsedMs)),
    };
  }
}
