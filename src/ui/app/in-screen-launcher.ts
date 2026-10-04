import { log } from "../../core/log/log.js";
import { routeInheritTo } from "../../core/process/inherit-sink.js";
import { loadEmbeddedTerminal, type EmbeddedTerminalSupport } from "../../core/pty/pty-loader.js";
import { createPtySink, type PtyBackend } from "../../core/pty/pty-sink.js";
import type { SelectedPackage } from "../../core/types.js";
import { runUpdates } from "../../core/update/update-pipeline.js";
import { requestsFrom } from "../../core/update/update-plan.js";
import type { UpdatePorts, UpdateRequest } from "../../core/update/update-ports.js";
import type { UpdateReport } from "../../core/update/update-report.js";
import { closeOnExitSignals } from "../run/run-control.js";
import { RunView } from "../run/run-view.js";
import { CONFIRM_UPDATE } from "../text/menu-labels.js";
import { CONFIRM_EXTRA, elevationKindOf, LAUNCH_ERROR } from "../text/run-labels.js";
import { outsideLauncher } from "./outside-launcher.js";
import type {
  LauncherContext,
  LauncherFactory,
  LaunchRequest,
  UpdateLauncher,
} from "./update-launcher.js";

/** What the in-screen launcher runs on; each part is replaceable for tests. */
export interface InScreenLauncherDeps {
  /** Whether installs can run in an embedded terminal (cached per process). */
  readonly loadSupport: () => Promise<EmbeddedTerminalSupport>;
  readonly runUpdates: (
    requests: readonly UpdateRequest[],
    ports: UpdatePorts,
  ) => Promise<UpdateReport>;
  readonly platform: NodeJS.Platform;
  /** The run's clock: durations, and how long a run lasted before it notifies. */
  readonly clock: () => number;
}

const DEFAULT_DEPS: InScreenLauncherDeps = {
  loadSupport: loadEmbeddedTerminal,
  runUpdates,
  platform: process.platform,
  clock: Date.now,
};

/** Packages listed by name in the confirmation; the rest are counted. */
const LISTED_PACKAGES = 8;

/**
 * Updates that run inside gup's screen: the run view takes the body, every
 * install runs in an embedded terminal pane, and the user lands back on
 * Paquets with the updated packages gone. Installed by the embedded-terminal
 * CLI module for the menu.
 *
 * When the embedded terminal is unavailable (`GUP_PTY=off`, node-pty missing,
 * the spawn probe failed), the confirmation says why and the update runs
 * outside the screen, exactly as the foundation's launcher does it.
 */
export function inScreenLauncher(overrides: Partial<InScreenLauncherDeps> = {}): LauncherFactory {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  return (context) => new InScreenLauncher(context, deps);
}

class InScreenLauncher implements UpdateLauncher {
  readonly #context: LauncherContext;
  readonly #deps: InScreenLauncherDeps;
  #isBusy = false;
  #isRunning = false;

  constructor(context: LauncherContext, deps: InScreenLauncherDeps) {
    this.#context = context;
    this.#deps = deps;
    // Warm the detection while the user browses: on Windows its spawn probe
    // costs about a second, which the confirmation would otherwise wait for.
    // A failure surfaces when an update is launched, not here.
    deps.loadSupport().catch(() => undefined);
  }

  get isRunning(): boolean {
    return this.#isRunning;
  }

  async launch(
    packages: readonly SelectedPackage[],
    request: LaunchRequest = {},
  ): Promise<UpdateReport | null> {
    if (packages.length === 0 || this.#isBusy || this.#context.isScanning()) return null;
    this.#isBusy = true;
    try {
      return await this.launchOnce(packages, request);
    } catch (error) {
      await this.reportFailure(error);
      return null;
    } finally {
      this.#isBusy = false;
      // The menu is back (Paquets, pruned): show it now, not at the next key.
      this.repaint();
    }
  }

  private async launchOnce(
    packages: readonly SelectedPackage[],
    request: LaunchRequest,
  ): Promise<UpdateReport | null> {
    const support = await this.#deps.loadSupport();
    if (!(await this.confirm(packages, support))) return null;
    if (!support.isAvailable) return this.outside(packages, request);
    const report = await this.inScreen(requestsFrom(packages, request), support);
    this.#context.afterUpdate(report, request.returnTo);
    return report;
  }

  /** The outside launcher, minus its own confirmation: this one was already answered. */
  private outside(
    packages: readonly SelectedPackage[],
    request: LaunchRequest,
  ): Promise<UpdateReport | null> {
    const context = this.#context;
    const confirmed = { ...context.preferences(), confirmBeforeUpdate: false };
    return outsideLauncher({ ...context, preferences: () => confirmed }).launch(packages, request);
  }

  private confirm(
    packages: readonly SelectedPackage[],
    support: EmbeddedTerminalSupport,
  ): Promise<boolean> {
    if (!this.#context.preferences().confirmBeforeUpdate) return Promise.resolve(true);
    const answer = this.#context.dialogs.confirm({
      title: CONFIRM_UPDATE.title,
      text: confirmationText(packages, support, this.#deps.platform),
    });
    this.repaint();
    return answer;
  }

  /**
   * Run the pipeline with the run view in front, the installs in its panes,
   * Ctrl+C and the exit signals on its controls; then the results, until
   * the user goes back.
   */
  private async inScreen(
    requests: readonly UpdateRequest[],
    backend: PtyBackend,
  ): Promise<UpdateReport> {
    const run = this.startRun(backend);
    this.#isRunning = true;
    try {
      const report = await this.#deps.runUpdates(requests, run.view.ports);
      run.endBatch();
      await run.view.finish();
      return report;
    } finally {
      this.#isRunning = false;
      run.release();
    }
  }

  private startRun(backend: PtyBackend): RunInScreen {
    const { view, releaseTakeover } = this.takeOver();
    const endBatch = once([
      routeInheritTo(createPtySink(backend, view.panes)),
      closeOnExitSignals(view.control),
    ]);
    const releaseCtrlC = this.#context.screen.interceptCtrlC(() => view.ctrlC());
    return {
      view,
      endBatch,
      release: once([endBatch, releaseCtrlC, () => view.destroy(), releaseTakeover]),
    };
  }

  /** The run view in front of the menu (the takeover starts it synchronously). */
  private takeOver(): { readonly view: RunView; readonly releaseTakeover: () => void } {
    const { preferences } = this.#context;
    const { platform, clock } = this.#deps;
    const started: { view?: RunView } = {};
    const releaseTakeover = this.#context.takeOver(
      (surface) => (started.view = new RunView({ surface, preferences, platform, clock })),
    );
    if (!started.view) {
      releaseTakeover();
      throw new Error("the run view did not start");
    }
    return { view: started.view, releaseTakeover };
  }

  private async reportFailure(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    log.error("ui.update-launch-failed", { error: message });
    const closed = this.#context.dialogs.choose({
      title: LAUNCH_ERROR.title,
      text: [LAUNCH_ERROR.text(message)],
      choices: [{ label: LAUNCH_ERROR.back, value: true }],
    });
    this.repaint();
    await closed;
  }

  /**
   * Ask for a frame on the next turn of the event loop. The launcher changes
   * the menu from promise continuations (a dialog once the detection
   * answered, the browse layout back after the results), which can run right
   * after a frame was drawn but before OpenTUI 0.5.14 marked it finished: the
   * frame request they make is then dropped, and an idle menu — no scan, no
   * run view ticking — would show the change only at the next key press.
   */
  private repaint(): void {
    const { renderer } = this.#context.screen;
    setImmediate(() => {
      if (!renderer.isDestroyed) renderer.requestRender();
    });
  }
}

/** An update running inside the screen, and how to undo its wiring. */
interface RunInScreen {
  readonly view: RunView;
  /** The batch is over: installs go back to the terminal, signals stop closing the gate. */
  readonly endBatch: () => void;
  /** Everything, view included (idempotent). */
  readonly release: () => void;
}

/** Run every step, in order, on the first call only. */
function once(steps: readonly (() => void)[]): () => void {
  let isDone = false;
  return () => {
    if (isDone) return;
    isDone = true;
    for (const step of steps) step();
  };
}

/**
 * The confirmation: what will be updated, then how — administrator rights at
 * the end of the batch, and the fallback outside the screen with its reason.
 */
function confirmationText(
  packages: readonly SelectedPackage[],
  support: EmbeddedTerminalSupport,
  platform: NodeJS.Platform,
): string[] {
  const listed = packages.slice(0, LISTED_PACKAGES).map(({ pkg }) => {
    const item = CONFIRM_UPDATE.item(pkg);
    return pkg.requiresAdmin ? `${item}  ${CONFIRM_EXTRA.adminTag}` : item;
  });
  const hidden = packages.length - listed.length;
  const admins = packages.filter(({ pkg }) => pkg.requiresAdmin === true).length;
  return [
    CONFIRM_UPDATE.heading(packages.length),
    "",
    ...listed,
    ...(hidden > 0 ? [CONFIRM_UPDATE.more(hidden)] : []),
    ...(admins > 0 ? ["", CONFIRM_EXTRA.admin[elevationKindOf(platform)](admins)] : []),
    ...(support.isAvailable ? [] : ["", CONFIRM_EXTRA.fallback(support.reason)]),
  ];
}
