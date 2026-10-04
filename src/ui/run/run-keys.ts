import { RUN_HINTS } from "../text/run-key-labels.js";
import type { ElevationKind } from "../text/run-labels.js";
import type { KeyPress } from "../tui/screen-host.js";
import type { RunPhase } from "./run-model.js";

/**
 * Who has the keyboard in the run view: gup while packages install (or the
 * elevated step runs, or another gup run holds the batch), the installer in
 * the terminal pane (typing), or gup again on the results.
 */
export type RunKeyMode = "running" | "elevating" | "waiting" | "typing" | "done";

export type RunCommand =
  | "skip"
  | "stop"
  | "focus"
  | "release"
  | "toggle-size"
  | "up"
  | "down"
  | "page-up"
  | "page-down"
  | "leave"
  | "refuse-quit"
  /** Typing: the key belongs to the installer — the focused pane encodes it. */
  | "pass"
  /** Nothing to do with it. */
  | "none";

const SCROLL: Readonly<Record<string, RunCommand>> = {
  up: "up",
  k: "up",
  down: "down",
  j: "down",
  pageup: "page-up",
  pagedown: "page-down",
};

const WHILE_RUNNING: Readonly<Record<string, RunCommand>> = {
  ...SCROLL,
  s: "skip",
  x: "stop",
  t: "focus",
  v: "toggle-size",
  q: "refuse-quit",
};

const ON_RESULTS: Readonly<Record<string, RunCommand>> = {
  ...SCROLL,
  v: "toggle-size",
  return: "leave",
  enter: "leave",
  escape: "leave",
  q: "leave",
};

/** Between two hints of the bar. */
const HINT_GAP = " · ";

/** Who has the keyboard, from where the run stands and whether the pane is focused. */
export function keyModeOf(phase: RunPhase, isPaneFocused: boolean): RunKeyMode {
  if (phase === "done") return "done";
  if (isPaneFocused) return "typing";
  if (phase === "elevating" || phase === "waiting") return phase;
  return "running";
}

/**
 * What a key means in the run view. Ctrl+C never maps to a command: the
 * screen's Ctrl+C interception owns it (it runs before any key listener), so
 * acting on it here too would count one press twice. In typing mode every key
 * but Ctrl+G is the installer's.
 */
export function runCommandFor(key: KeyPress, mode: RunKeyMode): RunCommand {
  if (mode === "typing") return isCtrl(key, "g") ? "release" : "pass";
  if (key.ctrl) return "none";
  const table = mode === "done" ? ON_RESULTS : WHILE_RUNNING;
  return table[key.name] ?? "none";
}

export interface RunHintsContext {
  readonly elevation: ElevationKind;
  readonly isEnlarged: boolean;
  /** The keys other views add to the results: "o rapport HTML". */
  readonly resultHints?: readonly string[];
}

/**
 * The key-hint bar of each mode. On the results the way back and the keys
 * other views add come before `v`: a narrow bar drops `v` first.
 */
export function runHintsFor(mode: RunKeyMode, context: RunHintsContext): string {
  if (mode === "typing") return RUN_HINTS.typing;
  if (mode === "elevating") return RUN_HINTS.elevating[context.elevation];
  if (mode === "waiting") return RUN_HINTS.waiting;
  if (mode === "done") {
    const { select, back, resize } = RUN_HINTS.done;
    const results = context.resultHints ?? [];
    return [select, back, ...results, resize(context.isEnlarged)].join(HINT_GAP);
  }
  return RUN_HINTS.running(context.isEnlarged);
}

function isCtrl(key: KeyPress, name: string): boolean {
  return key.ctrl && key.name === name;
}
