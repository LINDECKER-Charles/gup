import { log } from "../../core/log/log.js";
import type {
  Attempt,
  AttemptResult,
  PlannedUpdate,
  UpdateObserver,
  UpdatePorts,
} from "../../core/update/update-ports.js";
import type { UiPreferences } from "../app/ui-preferences.js";
import type {
  ResultAction,
  Takeover,
  TakeoverKey,
  TakeoverSurface,
} from "../app/view-definition.js";
import {
  elevationKindOf,
  PANE_LABELS,
  RUN_NOTICES,
  RUN_NOTIFICATION,
  RUN_TAGS,
  type ElevationKind,
} from "../text/run-labels.js";
import { isLikelyAwaitingInput } from "./prompt-hint.js";
import { RunControl } from "./run-control.js";
import { RunDialogs } from "./run-dialogs.js";
import {
  keyModeOf,
  runCommandFor,
  runHintsFor,
  type RunCommand,
  type RunKeyMode,
} from "./run-keys.js";
import { RunLayout } from "./run-layout.js";
import {
  outputTitle,
  runFacts,
  runTitle,
  statusLines,
  wantedStatusRows,
  type Notice,
  type StatusView,
} from "./run-lines.js";
import { labelOf, retryLabelOf, RunModel } from "./run-model.js";
import { ELEVATED_PANE_KEY, TerminalPanes } from "./terminal-panes.js";

/** How often the pane is checked for a silent program waiting on a prompt. */
const PROMPT_SAMPLE_MS = 500;
/**
 * A run at least this long notifies the terminal when it ends, if the user
 * asked for it (exported for the tests).
 */
export const NOTIFY_MIN_RUN_MS = 60_000;
const PAGE_STEP = 10;

export interface RunViewDeps {
  readonly surface: TakeoverSurface;
  readonly preferences: () => UiPreferences;
  readonly platform?: NodeJS.Platform;
  readonly clock?: () => number;
  /** Keys other views add to the results (`o rapport HTML`). */
  readonly actions?: readonly ResultAction[];
}

/**
 * The run view: the full-body screen of an update running inside gup. A
 * status list (one row per package, overall progress) above one live
 * terminal pane — the package in flight — then the results, with the keys
 * other views add to them, until the user goes back to Paquets. It hands the
 * pipeline its ports (observer, dialogs, abort gate) and the PTY sink its
 * panes; it never starts a process itself.
 */
export class RunView implements Takeover {
  readonly model: RunModel;
  readonly control: RunControl;
  readonly panes: TerminalPanes;
  readonly ports: UpdatePorts;
  readonly #surface: TakeoverSurface;
  readonly #preferences: () => UiPreferences;
  readonly #clock: () => number;
  readonly #elevation: ElevationKind;
  readonly #layout: RunLayout;
  readonly #dialogs: RunDialogs;
  readonly #actions: readonly ResultAction[];
  /** A result action is running: another one waits for it. */
  #isActing = false;
  #notice: Notice | null = null;
  #isPromptLikely = false;
  #lastSampleAt = 0;
  #frame = 0;
  #isEnlarged = false;
  /** While running: the row the user scrolled to (null follows the package in flight). */
  #scrolledTo: number | null = null;
  /** On the results: the selected row. */
  #cursor = 0;
  #rowItems: readonly (number | null)[] = [];
  #leave: (() => void) | null = null;

  constructor(deps: RunViewDeps) {
    this.#surface = deps.surface;
    this.#preferences = deps.preferences;
    this.#clock = deps.clock ?? Date.now;
    this.#actions = deps.actions ?? [];
    this.#elevation = elevationKindOf(deps.platform ?? process.platform);
    this.#layout = new RunLayout(deps.surface.screen, deps.surface.body);
    this.panes = new TerminalPanes(deps.surface.screen, this.#layout.host, {
      sizeHint: () => this.#layout.paneSize(),
      clock: this.#clock,
    });
    this.model = new RunModel(this.#clock);
    this.control = new RunControl();
    this.#dialogs = new RunDialogs(deps.surface.dialogs, {
      panes: this.panes,
      gate: this.control,
      elevation: this.#elevation,
    });
    this.ports = { observer: this.observer(), decisions: this.#dialogs, gate: this.control };
    this.#layout.status.onRowClick((row) => this.click(row));
  }

  press(key: TakeoverKey): void {
    const command = runCommandFor(key, this.mode());
    if (command === "pass") return;
    // The key is gup's: the pane must not get it too. `t` focuses the pane
    // while this very key is dispatched, and OpenTUI would hand it over.
    key.preventDefault();
    this.#notice = null;
    if (command === "none") void this.act(key);
    else this.run(command);
  }

  /** The screen's Ctrl+C: skip the install in flight; twice in a row, stop the run. */
  ctrlC(): void {
    const mode = this.mode();
    if (mode === "typing") return; // the focused pane sends ^C to the installer
    if (mode === "done") return this.#leave?.();
    this.#notice = null;
    if (this.control.pressCtrlC() === "stop") this.stopNow(RUN_NOTICES.ctrlCDouble);
    else if (mode === "elevating") this.say(RUN_NOTICES.skipAdmin[this.#elevation], "warning");
    else this.skip(RUN_NOTICES.ctrlCFirst);
  }

  tick(): void {
    if (this.#preferences().animations) this.#frame++;
    const now = this.#clock();
    if (now - this.#lastSampleAt < PROMPT_SAMPLE_MS) return;
    this.#lastSampleAt = now;
    const sample = this.panes.promptSample();
    this.#isPromptLikely =
      sample !== null && !this.panes.isFocused && isLikelyAwaitingInput(sample);
  }

  draw(): void {
    const view = this.statusView(Number.POSITIVE_INFINITY);
    const layout = this.#isEnlarged ? "enlarged" : "balanced";
    const rows = this.#layout.fit(wantedStatusRows(this.model, view), layout);
    const { lines, rowItems } = statusLines(this.model, { ...view, rows });
    this.#rowItems = rowItems;
    this.#layout.status.setTitle(runTitle(this.model));
    this.#layout.status.show(lines);
    const isTyping = this.mode() === "typing";
    this.#layout.setTerminalLook({
      title: this.paneTitle(),
      ...(isTyping && { caption: PANE_LABELS.focused }),
      isFocused: isTyping,
    });
    this.#surface.setFacts(runFacts(this.model));
    const context = {
      elevation: this.#elevation,
      isEnlarged: this.#isEnlarged,
      resultHints: this.#actions.map((action) => action.hint),
    };
    this.#surface.setHints(runHintsFor(this.mode(), context));
  }

  /**
   * The batch is over: show the results — the cursor on the first failure —
   * until the user goes back (Entrée, Échap, q, Ctrl+C).
   */
  finish(): Promise<void> {
    this.model.markDone();
    // A notice speaks of the run in flight ("Ctrl+C ×2 pour tout arrêter"):
    // the summary replaces it.
    this.#notice = null;
    this.panes.blur();
    const firstFailure = this.model.items.findIndex((item) => item.state === "failed");
    this.select(Math.max(0, firstFailure));
    this.notifyIfLong();
    this.draw();
    return new Promise((resolve) => (this.#leave = resolve));
  }

  destroy(): void {
    this.#leave = null;
    this.panes.destroy();
    this.#layout.destroy();
  }

  // -- Pipeline events --------------------------------------------------------

  private observer(): UpdateObserver {
    return {
      planned: (plan) => this.observe(() => this.model.planned(plan)),
      started: (attempt) => this.observe(() => this.started(attempt)),
      finished: (result) => this.observe(() => this.finished(result)),
      elevationStarted: (items) => this.observe(() => this.elevationStarted(items)),
      cancelled: (items) => this.observe(() => this.model.cancelled(items)),
      waiting: (holder) => this.observe(() => this.model.waiting(holder)),
    };
  }

  /** An observer must not throw: a drawing problem never stops the updates. */
  private observe(event: () => void): void {
    try {
      event();
      this.draw();
    } catch (error) {
      log.warn("ui.run-view-failed", { error: messageOf(error) });
    }
  }

  private started({ item, retry }: Attempt): void {
    this.model.started({ item, ...(retry !== undefined && { retry }) });
    this.#scrolledTo = null;
    this.panes.open(item.key, PANE_LABELS.title(item.providerName, labelOf(item)));
    if (retry !== undefined) this.panes.current().note(RUN_TAGS.retry(retryLabelOf(retry)));
  }

  private finished(result: AttemptResult): void {
    this.model.finished(result);
    this.panes.settle(result.item.key, result.outcome);
    this.panes.blur();
  }

  private elevationStarted(items: readonly PlannedUpdate[]): void {
    this.model.elevationStarted(items);
    this.panes.open(ELEVATED_PANE_KEY, PANE_LABELS.admin[this.#elevation]);
    if (this.#elevation !== "uac") return;
    const pane = this.panes.current();
    pane.note(PANE_LABELS.approveUac);
    pane.note(PANE_LABELS.adminElsewhere(items.length));
  }

  // -- Keys -------------------------------------------------------------------

  private mode(): RunKeyMode {
    return keyModeOf(this.model.phase, this.panes.isFocused);
  }

  private run(command: RunCommand): void {
    const actions: Partial<Record<RunCommand, () => void>> = {
      skip: () => this.skipKey(),
      stop: () => void this.stop(),
      focus: () => this.focusPane(),
      release: () => this.panes.blur(),
      "toggle-size": () => (this.#isEnlarged = !this.#isEnlarged),
      up: () => this.move(-1),
      down: () => this.move(1),
      "page-up": () => this.move(-PAGE_STEP),
      "page-down": () => this.move(PAGE_STEP),
      leave: () => this.#leave?.(),
      "refuse-quit": () => this.say(RUN_NOTICES.quit, "warning"),
    };
    actions[command]?.();
  }

  /**
   * A key another view added to the results (`o rapport HTML`): one at a
   * time, `pending` shown meanwhile, then its notice — unless the user left.
   */
  private async act(key: TakeoverKey): Promise<void> {
    if (key.ctrl || this.model.phase !== "done" || this.#isActing) return;
    const action = this.#actions.find((candidate) => candidate.key === key.name);
    if (!action) return;
    this.#isActing = true;
    this.say(action.pending, "muted");
    const notice = await action.run().catch(actionFailure);
    this.#isActing = false;
    if (this.#leave === null) return;
    this.#notice = notice;
    this.draw();
  }

  private skipKey(): void {
    if (this.model.phase === "elevating") {
      return this.say(RUN_NOTICES.skipAdmin[this.#elevation], "warning");
    }
    this.skip(RUN_NOTICES.skipped);
  }

  private skip(notice: string): void {
    if (this.control.skip()) this.say(notice, "warning");
    else this.say(RUN_NOTICES.skipIdle, "muted");
  }

  /** `x`: after a confirmation — or at once during the elevated step, which only ends early. */
  private async stop(): Promise<void> {
    if (this.model.isStopping) return;
    if (this.model.phase === "elevating") return this.stopNow(RUN_NOTICES.stopAfterStep);
    if (!(await this.#dialogs.confirmStop(this.model.remaining()))) return;
    if (this.model.phase !== "done") this.stopNow(RUN_NOTICES.ctrlCDouble);
    this.draw();
  }

  private stopNow(notice: string): void {
    if (this.model.phase === "elevating") {
      this.control.stopAfterStep();
      this.say(RUN_NOTICES.stopAfterStep, "danger");
    } else {
      this.control.stop();
      this.say(notice, "danger");
    }
    this.model.markStopping();
  }

  private focusPane(): void {
    const isUacStep = this.model.phase === "elevating" && this.#elevation === "uac";
    if (isUacStep) return this.say(RUN_NOTICES.skipAdmin.uac, "warning");
    if (!this.panes.focus()) this.say(RUN_NOTICES.typeIdle, "muted");
  }

  private move(delta: number): void {
    const last = this.model.items.length - 1;
    if (last < 0) return;
    if (this.model.phase === "done") return this.select(clamp(this.#cursor + delta, 0, last));
    this.#scrolledTo = clamp(this.focusIndex() + delta, 0, last);
  }

  private click(row: number): void {
    const index = this.#rowItems[row];
    if (this.#surface.dialogs.isOpen || index === null || index === undefined) return;
    if (this.model.phase === "done") this.select(index);
    this.draw();
  }

  /** Results: select a package and show what its terminal kept. */
  private select(index: number): void {
    this.#cursor = index;
    const item = this.model.items[index];
    if (!item) return;
    const placeholder =
      item.state === "succeeded" ? PANE_LABELS.notRetained : PANE_LABELS.noOutput;
    this.panes.show(item.isAdmin ? ELEVATED_PANE_KEY : item.key, placeholder);
  }

  private say(text: string, tone: Notice["tone"]): void {
    this.#notice = { text, tone };
  }

  // -- Drawing ----------------------------------------------------------------

  private statusView(rows: number): StatusView {
    const isDone = this.model.phase === "done";
    return {
      width: this.#layout.statusWidth(),
      rows,
      focus: this.focusIndex(),
      cursor: isDone ? this.#cursor : null,
      frame: this.#frame,
      now: this.#clock(),
      elevation: this.#elevation,
      notice: this.#notice,
      promptHint: this.#isPromptLikely ? RUN_NOTICES.prompt : null,
      isEnlarged: this.#isEnlarged,
    };
  }

  /**
   * The row kept in view: the selection, the row scrolled to, the package in
   * flight, or the last one done.
   */
  private focusIndex(): number {
    if (this.model.phase === "done") return this.#cursor;
    return this.#scrolledTo ?? this.model.activeIndex();
  }

  private paneTitle(): string {
    if (this.model.phase !== "done") return this.panes.title ?? "";
    return outputTitle(this.model.items[this.#cursor], this.#elevation);
  }

  /** A long run ended: tell the terminal (a desktop notification where it supports one). */
  private notifyIfLong(): void {
    if (!this.#preferences().notifyOnDone || this.model.elapsedMs() < NOTIFY_MIN_RUN_MS) return;
    const { succeeded, skipped, failed } = this.model.counts();
    const { renderer, appearance } = this.#surface.screen;
    const body = appearance.glyphs(RUN_NOTIFICATION.body(succeeded, skipped, failed));
    try {
      renderer.triggerNotification(body, RUN_NOTIFICATION.title);
    } catch (error) {
      log.debug("ui.notification-failed", { error: messageOf(error) });
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A result action broke its promise not to reject: say why on the results. */
function actionFailure(error: unknown): Notice {
  return { text: RUN_NOTICES.actionFailed(messageOf(error)), tone: "danger" };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
