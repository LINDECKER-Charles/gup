import chalk from "chalk";
import type { Provider, ProviderScanResult } from "../core/types.js";
import { recordScan } from "../core/history/store.js";
import { log } from "../core/log/log.js";
import { detectAvailableProviders, scanAll, type ScanOptions } from "../core/registry.js";
import {
  SILENT_SCAN,
  type ProviderOutcome,
  type ScanEvents,
  type ScanObserver,
} from "./panels/scan-panel.js";
import { withScanScreen } from "./prompts/scan-screen.js";
import { formatDuration } from "./text/fr-format.js";
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
 * the scan in the history — each provider's own duration included — and in
 * the debug log. Shared by the menu and the one-shot commands.
 */
export async function runScan(options: BaseScanOptions, events: ScanEvents): Promise<ScanRun> {
  events.detecting();
  const detected = await detectAvailableProviders();
  const planned = countPlanned(detected, options);
  events.planned(planned);
  log.info("scan.start", { planned, fast: options.fast === true, filter: options.only ?? [] });
  const startedAt = Date.now();
  const timings = new ProviderTimings();
  const results =
    planned === 0
      ? []
      : await scanAll({
          ...options,
          detected,
          onProviderStart: (p) => {
            timings.start(p.id);
            events.started(p.displayName);
          },
          onProviderEnd: (p, r) => events.finished(p.displayName, providerEnded(r, timings)),
        });
  const elapsedMs = Date.now() - startedAt;
  if (planned > 0) {
    recordScan({ results, durationMs: elapsedMs, options, providerDurations: timings.durations });
  }
  logScanEnd(results, elapsedMs);
  events.completed(elapsedMs);
  return { results, detected, planned, elapsedMs };
}

/** When each provider's scan started, then how long it took. */
class ProviderTimings {
  readonly #startedAt = new Map<string, number>();
  readonly durations = new Map<string, number>();

  start(providerId: string): void {
    this.#startedAt.set(providerId, Date.now());
  }

  /** The provider's duration in ms (0 when its start was not seen), kept for the history. */
  end(providerId: string): number {
    const startedAt = this.#startedAt.get(providerId);
    const ms = startedAt === undefined ? 0 : Date.now() - startedAt;
    this.durations.set(providerId, ms);
    return ms;
  }
}

/**
 * One provider finished: timed, logged (the scan's operation context names
 * the provider), and summed up for the screen.
 */
function providerEnded(result: ProviderScanResult, timings: ProviderTimings): ProviderOutcome {
  const ms = timings.end(result.providerId);
  const outdated = result.packages.length;
  if (result.error === undefined) log.debug("scan.provider", { ms, outdated });
  else log.warn("scan.provider", { ms, outdated, error: result.error });
  return { updates: outdated, ms, ...(result.error && { error: result.error }) };
}

function logScanEnd(results: readonly ProviderScanResult[], ms: number): void {
  log.info("scan.end", {
    ms,
    providers: results.length,
    outdated: results.reduce((total, result) => total + result.packages.length, 0),
    errors: results.filter((result) => result.error !== undefined).length,
  });
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

function reportScanDone({ results, planned, elapsedMs }: ScanRun): void {
  if (planned === 0) {
    process.stdout.write(chalk.dim("  aucun provider disponible\n"));
    return;
  }
  const elapsed = formatDuration(elapsedMs);
  const updates = results.reduce((n, r) => n + r.packages.length, 0);
  process.stdout.write(
    chalk.dim(
      `  scan terminé en ${elapsed} — ${planned} provider(s), ${updates} mise(s) à jour\n`,
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
