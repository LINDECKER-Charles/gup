import { activeInheritSink } from "../../../../src/core/process/inherit-sink.js";
import type { PtyModule } from "../../../../src/core/pty/pty-loader.js";
import { getProvider } from "../../../../src/core/registry.js";
import type { UpdateOutcome } from "../../../../src/core/types.js";
import { RETRY_TIERS } from "../../../../src/core/update/retry-pass.js";
import { planUpdates } from "../../../../src/core/update/update-plan.js";
import type {
  OutcomeEntry,
  PlannedUpdate,
  UpdatePorts,
  UpdateRequest,
} from "../../../../src/core/update/update-ports.js";
import {
  buildReport,
  entryOf,
  type UpdateReport,
} from "../../../../src/core/update/update-report.js";
import { fakePty, type FakeHandle } from "../../../../tests/support/pty/fake-pty.js";

/** How one package's install goes in a scripted run. */
export interface ScriptedInstall {
  /** `provider:package`, the pipeline's key. */
  readonly key: string;
  /** What the install prints in its pane; the elevated batch prints nothing there. */
  readonly output?: string;
  /** How long it took: the run's clock moves by that much. */
  readonly ms: number;
  /** A failure the provider flags retryable, as winget does; absent: a success. */
  readonly fails?: true;
  /** The run stops on this install, its output on screen, until the capture is over. */
  readonly holds?: true;
}

/**
 * An update run played from a script, with the pipeline's contract
 * (`runUpdates(requests, ports)`): the same plan, the same observer events,
 * the same questions (elevation, retry) in the same order — but no provider
 * runs. Each direct install goes through the install sink the run view
 * routed, so the real PTY sink and session put its output in the real pane;
 * the pseudo-terminal under them is an in-memory one playing the script's
 * output. The run's clock is the script's: durations and the elapsed time
 * read what the script says, not how fast the screenshot was taken. A scene
 * accepts the administrator step and declines the retry offer: the script
 * plays no other answer, and says so.
 */
export class ScriptedRun {
  /** What `inScreenLauncher` reads the embedded terminal from. */
  readonly pty: PtyModule;
  readonly #installs: readonly ScriptedInstall[];
  #now: number;
  #next: ScriptedInstall | null = null;
  #isReleased = false;
  #release: () => void = () => {};
  readonly #released = new Promise<void>((resolve) => (this.#release = resolve));

  constructor(installs: readonly ScriptedInstall[], startsAt: Date) {
    this.#installs = installs;
    this.#now = startsAt.getTime();
    this.pty = fakePty({ onSpawn: (handle) => this.play(handle) }).module;
  }

  /** The run's clock (epoch ms). */
  readonly clock = (): number => this.#now;

  readonly run = async (
    requests: readonly UpdateRequest[],
    ports: UpdatePorts,
  ): Promise<UpdateReport> => {
    const plan = planUpdates(requests, (id) => getProvider(id)?.displayName ?? id);
    ports.observer.planned(plan);
    const entries: OutcomeEntry[] = [];
    for (const item of plan.direct) {
      const entry = await this.attempt(item, ports);
      if (entry === null) break;
      entries.push(entry);
    }
    const planned = [...plan.direct, ...plan.elevated];
    if (!this.#isReleased) entries.push(...(await this.elevated(plan.elevated, ports)));
    if (!this.#isReleased) await this.declineRetries(entries, planned, ports);
    const settled = new Set(entries.map((entry) => entry.key));
    const cancelled = planned.filter((item) => !settled.has(item.key));
    if (cancelled.length > 0) ports.observer.cancelled(cancelled);
    return buildReport(entries, cancelled);
  };

  /** The capture is over: a held install ends, and the run stops after it. */
  release(): void {
    this.#isReleased = true;
    this.#release();
  }

  /** One direct install, as `applyUpdate` drives it; null once the capture is over. */
  private async attempt(item: PlannedUpdate, ports: UpdatePorts): Promise<OutcomeEntry | null> {
    const install = this.scripted(item.key);
    ports.observer.started({ item });
    const sink = activeInheritSink();
    if (sink === null) throw new Error("the run view routed no install sink");
    this.#next = install;
    // In flight for `ms` already when the run holds on it; done after `ms` otherwise.
    this.#now += install.ms;
    await sink.start({ command: item.providerId, args: [item.packageId] }).exited;
    if (this.#isReleased) return null;
    const outcome = outcomeOf(item, install);
    ports.observer.finished({ item, outcome, durationMs: install.ms });
    return entryOf(item, outcome);
  }

  /** The admin packages, behind one confirmation, as `runElevatedStep` asks it. */
  private async elevated(
    items: readonly PlannedUpdate[],
    ports: UpdatePorts,
  ): Promise<OutcomeEntry[]> {
    if (items.length === 0) return [];
    if (!(await ports.decisions.confirmElevation(items.length))) {
      throw new Error("a scripted run elevates: accept the administrator step in the scene");
    }
    ports.observer.elevationStarted(items);
    this.#now += items.reduce((total, item) => total + this.scripted(item.key).ms, 0);
    return items.map((item) => {
      const outcome: UpdateOutcome = { id: item.packageId, success: true };
      // Durations are lost in the elevated round trip: the pipeline reports none.
      ports.observer.finished({ item, outcome });
      return entryOf(item, outcome);
    });
  }

  /** The retry question the pipeline asks for retryable failures; the script replays none. */
  private async declineRetries(
    entries: readonly OutcomeEntry[],
    planned: readonly PlannedUpdate[],
    ports: UpdatePorts,
  ): Promise<void> {
    const retryable = new Set(entries.filter((e) => e.outcome.retryable).map((e) => e.key));
    const failures = planned.filter((item) => retryable.has(item.key));
    if (failures.length === 0) return;
    const strategies = RETRY_TIERS.map((tier) => tier.id);
    if ((await ports.decisions.chooseRetry({ failures, strategies })) !== null) {
      throw new Error("a scripted run replays no retry: decline it in the scene");
    }
  }

  /** A pseudo-terminal child of the install that starts: its output, then its exit. */
  private play(handle: FakeHandle): void {
    const install = this.#next;
    this.#next = null;
    // The session subscribes once spawn() returned: play on the next turn.
    setImmediate(() => {
      if (install?.output) handle.emitData(install.output);
      const exit = (): void => handle.emitExit({ exitCode: install?.fails ? 1 : 0 });
      if (install?.holds) void this.#released.then(exit);
      else exit();
    });
  }

  private scripted(key: string): ScriptedInstall {
    const install = this.#installs.find((candidate) => candidate.key === key);
    if (!install) throw new Error(`the update script has no install for ${key}`);
    return install;
  }
}

function outcomeOf(item: PlannedUpdate, install: ScriptedInstall): UpdateOutcome {
  return install.fails
    ? { id: item.packageId, success: false, retryable: true }
    : { id: item.packageId, success: true };
}
