import { log } from "../log/log.js";
import type {
  InheritExit,
  InheritProcess,
  InheritRequest,
  InheritSink,
} from "../process/inherit-sink.js";
import { createExitFileSlot, type ExitFileSlot } from "./exit-file.js";
import type { PtyModule } from "./pty-loader.js";
import { PTY_LABELS } from "./pty-labels.js";
import { PtySession } from "./pty-session.js";
import { trampolineLaunch, type TrampolineLocation } from "./trampoline.js";

/**
 * The install sink of the embedded terminal: with it routed
 * (`routeInheritTo`), every `runInherit` starts the trampoline in a
 * pseudo-terminal whose screen is a pane of the run view. The panes are a
 * port, so no OpenTUI type crosses into `core`: the run view implements it.
 */

/** A pane's keyboard side: encoded keys and pastes, terminal responses, its size. */
export interface PtyInput {
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
}

/** One terminal pane, as the sink sees it. */
export interface PtyPane {
  /** The size a child starts with. */
  size(): { readonly cols: number; readonly rows: number };
  /** The child's output: a VT stream. */
  write(data: string): void;
  /** A line from gup itself (a session that could not start). */
  note(line: string): void;
  /** Send this pane's keys, responses and resizes to `input` until the returned detach. */
  attach(input: PtyInput): () => void;
  /** The last visible lines, for the install's trace. */
  tail(): string;
}

export interface PtyPanes {
  /** The pane of the install that starts now. */
  current(): PtyPane;
}

/** An available embedded terminal: node-pty and the trampoline. */
export interface PtyBackend {
  readonly pty: PtyModule;
  readonly trampoline: TrampolineLocation;
}

/** Reported for a session that never started, as `runInherit` does for a failed spawn. */
const NO_EXIT_CODE = -1;

export function createPtySink(backend: PtyBackend, panes: PtyPanes): InheritSink {
  return {
    mode: "pty",
    start: (request) => startInPane(request, backend, panes.current()),
    note: (line) => noteIn(panes.current(), line),
  };
}

/**
 * The pane is bound here, at spawn: the run view opens the next package's
 * pane as soon as this one reports its outcome, while this child's last
 * output may still be on its way.
 */
function startInPane(request: InheritRequest, backend: PtyBackend, pane: PtyPane): InheritProcess {
  const exitFile = process.platform === "win32" ? exitFileSlot() : null;
  try {
    const launch = trampolineLaunch(request, backend.trampoline, exitFile?.path);
    const session = PtySession.start(
      backend.pty,
      { ...launch, ...pane.size(), ...(exitFile !== null && { exitFile: exitFile.path }) },
      (data) => pane.write(data),
    );
    const detach = attachSafely(pane, session);
    void session.closed.then(() => exitFile?.release());
    return {
      exited: session.exited.then((exit) => ended(exit, pane, detach)),
      kill: () => session.kill(),
    };
  } catch (error) {
    void exitFile?.release();
    return notStarted(pane, error);
  }
}

/** The child runs either way: a pane that cannot take the keyboard only loses typing. */
function attachSafely(pane: PtyPane, session: PtySession): () => void {
  try {
    return pane.attach(session);
  } catch {
    return () => {};
  }
}

/** The Windows fast path's file; without one, the exit waits for node-pty's own event. */
function exitFileSlot(): ExitFileSlot | null {
  try {
    return createExitFileSlot();
  } catch (error) {
    log.debug("pty.exit-file-unavailable", { error: messageOf(error) });
    return null;
  }
}

/** Give the keyboard back to gup, and attach the visible tail for the trace. */
function ended(exit: InheritExit, pane: PtyPane, detach: () => void): InheritExit {
  try {
    detach();
    return { ...exit, outputTail: pane.tail() };
  } catch {
    return exit;
  }
}

function notStarted(pane: PtyPane, error: unknown): InheritProcess {
  const reason = messageOf(error);
  log.warn("pty.spawn-failed", { error: reason });
  noteIn(pane, PTY_LABELS.spawnFailed(reason));
  return { exited: Promise.resolve({ exitCode: NO_EXIT_CODE, failed: true }), kill: () => {} };
}

function noteIn(pane: PtyPane, line: string): void {
  try {
    pane.note(line);
  } catch {
    // A note is informational: never let it fail an install.
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
