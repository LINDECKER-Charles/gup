import { log } from "../../core/log/log.js";
import type { UpdateObserver, UpdatePorts } from "../../core/update/update-ports.js";
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
  type ElevationKind,
} from "../text/run-labels.js";
import { RunControl } from "./run-control.js";
import { RunDialogs } from "./run-dialogs.js";
import { runObserver } from "./run-events.js";
import {
  keyModeOf,
  runCommandFor,
  runHintsFor,
  type RunCommand,
  type RunKeyMode,
} from "./run-keys.js";
import { RunLayout } from "./run-layout.js";
import { RunLevers } from "./run-levers.js";
import {
  outputTitle,
  runFacts,
  runTitle,
  statusLines,
  wantedStatusRows,
  type Notice,
  type StatusView,
} from "./run-lines.js";
import { RunModel } from "./run-model.js";
import { isLikelyAwaitingInput } from "./terminal/prompt-hint.js";
import { ELEVATED_PANE_KEY, TerminalPanes } from "./terminal/terminal-panes.js";

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
 * other views add to them, until the user leaves them — where the menu goes
 * then (Paquets, Planification, a rescan) is the session's call. It hands the
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
  readonly #levers: RunLevers;
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
    const dialogs = new RunDialogs(deps.surface.dialogs, {
      panes: this.panes,
      gate: this.control,
      elevation: this.#elevation,
    });
    this.#levers = this.levers(dialogs);
    this.ports = { observer: this.observer(), decisions: dialogs, gate: this.control };
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
    this.#levers.ctrlC();
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
    this.#surface.setHints(this.hints());
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

  // -- Wiring -----------------------------------------------------------------

  private levers(dialogs: RunDialogs): RunLevers {
    return new RunLevers({
      model: this.model,
      control: this.control,
      panes: this.panes,
      dialogs,
      elevation: this.#elevation,
      say: (text, tone) => this.say(text, tone),
      redraw: () => this.draw(),
    });
  }

  private observer(): UpdateObserver {
    return runObserver({
      model: this.model,
      panes: this.panes,
      elevation: this.#elevation,
      onStarted: () => (this.#scrolledTo = null),
      redraw: () => this.draw(),
    });
  }

  // -- Keys -------------------------------------------------------------------

  private mode(): RunKeyMode {
    return keyModeOf(this.model.phase, this.panes.isFocused);
  }

  private run(command: RunCommand): void {
    const actions: Partial<Record<RunCommand, () => void>> = {
      skip: () => this.#levers.skip(),
      stop: () => void this.#levers.stop(),
      focus: () => this.#levers.focus(),
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

  /** An open dialog's keys, else the run's for its mode, with the keys other views add. */
  private hints(): string {
    const { dialogs } = this.#surface;
    if (dialogs.isOpen) return dialogs.hints();
    return runHintsFor(this.mode(), {
      elevation: this.#elevation,
      isEnlarged: this.#isEnlarged,
      resultHints: this.#actions.map((action) => action.hint),
    });
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
