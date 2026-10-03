import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type { UpdateReport } from "../../../src/core/update/update-report.js";
import type { MenuController } from "../../../src/ui/app/menu-session.js";
import type { ScanEvents } from "../../../src/ui/panels/scan-panel.js";
import { registeredProvider } from "./registered-provider.js";
import type { ScanFixture, ScanStep } from "./scan.js";

/** Where a scene stops the scan: `finished` providers done, the next `running` ones started. */
export interface ScanHold {
  readonly finished: number;
  readonly running: number;
}

export interface ControllerData {
  readonly scan: ScanFixture;
  /** Hold the replay there until `release()` — the scan-progress screenshot. */
  readonly holdScan?: ScanHold;
}

/**
 * The app's view of gup, entirely from fixtures: a scan replayed event by
 * event, display names from the registry, and no update — a screenshot never
 * leaves the screen. It never reaches the runner, the OS or the network.
 * Every member `MenuController` gains must be implemented here, which the
 * scripts typecheck enforces.
 */
export class FixtureController implements MenuController {
  readonly #data: ControllerData;
  readonly #names: ReadonlyMap<string, string>;
  #release: () => void = () => {};
  readonly #released = new Promise<void>((resolve) => (this.#release = resolve));

  constructor(data: ControllerData) {
    this.#data = data;
    this.#names = new Map(
      data.scan.steps.map(({ providerId }) => [
        providerId,
        registeredProvider(providerId).displayName,
      ]),
    );
  }

  /** Let a held scan finish, so the session can settle and end. */
  release(): void {
    this.#release();
  }

  async scan(state: MenuState, events: ScanEvents): Promise<void> {
    const { steps, elapsedMs } = this.#data.scan;
    const held = this.#data.holdScan;
    const split = held?.finished ?? steps.length;
    events.detecting();
    events.planned(steps.length);
    for (const step of steps.slice(0, split)) this.replay(step, events);
    const inFlight = steps.slice(split, split + (held?.running ?? 0));
    for (const step of inFlight) events.started(this.displayName(step.providerId));
    if (held) await this.#released;
    for (const step of inFlight) this.finish(step, events);
    for (const step of steps.slice(split + inFlight.length)) this.replay(step, events);
    events.completed(elapsedMs);
    this.store(state);
  }

  displayName(providerId: string): string {
    return this.#names.get(providerId) ?? providerId;
  }

  updateOutside(): Promise<UpdateReport> {
    return Promise.reject(new Error("a screenshot never runs an update"));
  }

  private replay(step: ScanStep, events: ScanEvents): void {
    events.started(this.displayName(step.providerId));
    this.finish(step, events);
  }

  /** The provider's outcome, as the real scan reports it: what it found, or why it failed. */
  private finish(step: ScanStep, events: ScanEvents): void {
    const { packages, error } = this.resultOf(step.providerId);
    events.finished(this.displayName(step.providerId), {
      updates: packages.length,
      ms: step.ms,
      ...(error !== undefined && { error }),
    });
  }

  private resultOf(providerId: string): ProviderScanResult {
    const result = this.#data.scan.results.find((candidate) => candidate.providerId === providerId);
    return result ?? { providerId, available: true, packages: [] };
  }

  /** What the real scan leaves in the menu state: results, detected count, filter choices. */
  private store(state: MenuState): void {
    const ids = this.#data.scan.steps.map((step) => step.providerId);
    state.scans = ids.map((id) => this.resultOf(id));
    state.detectedCount = ids.length;
    state.providers = ids.map((id) => ({ id, displayName: this.displayName(id) }));
  }
}
