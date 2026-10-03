import type { InheritExit, InheritProcess } from "../process/inherit-sink.js";
import type { PtyExitEvent, PtyHandle, PtyModule } from "./pty-loader.js";
import { ptyKill } from "./pty-kill.js";

/** What the child sees in `TERM`: OpenTUI's embedded terminal emulates xterm. */
export const TERM_NAME = "xterm-256color";

/** execa's `forceKillAfterDelay` default: SIGTERM, then SIGKILL this long after (POSIX). */
const KILL_GRACE_MS = 5_000;
const MIN_COLS = 20;
const MIN_ROWS = 3;
/** Reported when a signal ended the child, as `runInherit` does without a PTY. */
const SIGNAL_EXIT_CODE = -1;

/** What to run in the pseudo-terminal, and at which size. */
export interface PtyLaunch {
  readonly file: string;
  readonly args: readonly string[];
  readonly cols: number;
  readonly rows: number;
}

/**
 * One child in a pseudo-terminal, as an install process: its output goes to
 * `onData` until node-pty reports its exit, its keyboard comes from `write`.
 * `exited` resolves on node-pty's exit event; `closed` once that event came
 * and the pseudo-console was released.
 */
export class PtySession implements InheritProcess {
  readonly exited: Promise<InheritExit>;
  readonly closed: Promise<void>;
  private readonly handle: PtyHandle;
  private hasExited = false;
  private isKilled = false;
  private lastOutput = Date.now();
  private killTimer: NodeJS.Timeout | null = null;
  private settle: (exit: InheritExit) => void = () => {};

  /** Throws when node-pty cannot start the child. */
  static start(pty: PtyModule, launch: PtyLaunch, onData: (data: string) => void): PtySession {
    const handle = pty.spawn(launch.file, [...launch.args], {
      name: TERM_NAME,
      cols: Math.max(MIN_COLS, launch.cols),
      rows: Math.max(MIN_ROWS, launch.rows),
    });
    return new PtySession(handle, onData);
  }

  private constructor(handle: PtyHandle, onData: (data: string) => void) {
    this.handle = handle;
    this.exited = new Promise((resolve) => (this.settle = resolve));
    const output = handle.onData((data) => this.forward(data, onData));
    this.closed = new Promise((resolve) => {
      const exit = handle.onExit((event) => {
        this.finish(exitOf(event));
        exit.dispose();
        output.dispose();
        releaseConpty(handle);
        resolve();
      });
    });
  }

  /** Epoch ms of the last output — what tells a silent program waiting for input. */
  get lastOutputAt(): number {
    return this.lastOutput;
  }

  /** Keys, pastes and terminal responses for the child. A no-op once it exited. */
  write(data: string | Uint8Array): void {
    if (this.hasExited) return;
    try {
      this.handle.write(typeof data === "string" ? data : Buffer.from(data));
    } catch {
      // The pipe closed under us: the exit event follows.
    }
  }

  /** Clamped to a usable minimum. A no-op once the child exited (ConPTY throws then). */
  resize(cols: number, rows: number): void {
    if (this.hasExited) return;
    try {
      this.handle.resize(Math.max(MIN_COLS, cols), Math.max(MIN_ROWS, rows));
    } catch {
      // Exited between the check and the call, or a size node-pty refuses.
    }
  }

  /** Kill the whole tree (skip, timeout). Idempotent, never throws. */
  kill(): void {
    if (this.hasExited || this.isKilled) return;
    this.isKilled = true;
    ptyKill.terminate(this.handle.pid);
    this.killTimer = setTimeout(() => {
      this.killTimer = null;
      if (!this.hasExited) ptyKill.force(this.handle.pid);
    }, KILL_GRACE_MS);
  }

  private forward(data: string, onData: (data: string) => void): void {
    this.lastOutput = Date.now();
    try {
      onData(data);
    } catch {
      // A failing pane must not take the install down with it.
    }
  }

  private finish(exit: InheritExit): void {
    if (this.hasExited) return;
    this.hasExited = true;
    if (this.killTimer) clearTimeout(this.killTimer);
    this.settle(exit);
  }
}

function exitOf(event: PtyExitEvent): InheritExit {
  const isSignalled = Boolean(event.signal);
  return {
    exitCode: isSignalled ? SIGNAL_EXIT_CODE : event.exitCode,
    failed: isSignalled || event.exitCode !== 0,
  };
}

// ---------------------------------------------------------------------------
// ConPTY release
//
// node-pty 1.1.0 closes the pseudo-console only inside `WindowsPtyAgent.kill()`,
// which also forks the console-list agent gup must never run. A child that
// exits on its own therefore leaves one conhost.exe and one conout worker
// thread (a MessagePort) behind, per session, for the life of gup. Releasing
// them means reaching into the agent: these are the exact internals of the
// pinned version, checked by shape before use (pty-loader refuses a node-pty
// whose handles do not match, so gup falls back to running updates outside
// the screen instead of leaking).
// ---------------------------------------------------------------------------

interface ConptyAgent {
  readonly _pty: number;
  readonly _ptyNative: { kill(pty: number, useConptyDll: boolean): void };
  readonly _conoutSocketWorker: { dispose(): void };
  readonly _inSocket: { destroy(): void };
  readonly _outSocket: { destroy(): void };
}

const releasedHandles = new WeakSet<PtyHandle>();

/**
 * Whether `handle` is a system-ConPTY handle of the pinned node-pty, which
 * {@link releaseConpty} can release.
 */
export function isReleasableConpty(handle: PtyHandle): boolean {
  return conptyAgentOf(handle) !== null;
}

/**
 * Close the pseudo-console of a child node-pty reported exited, and dispose
 * of its pipes and drain worker. Windows only; once per handle (closing a
 * pseudo-console twice is a native use-after-free); never throws. Also for
 * the E2E harness, which must not call `IPty.kill()` either.
 */
export function releaseConpty(handle: PtyHandle): void {
  if (process.platform !== "win32" || releasedHandles.has(handle)) return;
  const agent = conptyAgentOf(handle);
  if (!agent) return;
  releasedHandles.add(handle);
  try {
    agent._ptyNative.kill(agent._pty, false);
    agent._conoutSocketWorker.dispose();
    agent._inSocket.destroy();
    agent._outSocket.destroy();
  } catch {
    // Half-released already (a node-pty path we do not use): nothing to add.
  }
}

function conptyAgentOf(handle: PtyHandle): ConptyAgent | null {
  const agent: unknown = Reflect.get(handle, "_agent");
  if (!isRecord(agent)) return null;
  const isSystemConpty =
    agent["_useConpty"] === true &&
    agent["_useConptyDll"] === false &&
    typeof agent["_pty"] === "number";
  const hasParts =
    hasMethod(agent["_ptyNative"], "kill") &&
    hasMethod(agent["_conoutSocketWorker"], "dispose") &&
    hasMethod(agent["_inSocket"], "destroy") &&
    hasMethod(agent["_outSocket"], "destroy");
  return isSystemConpty && hasParts ? (agent as unknown as ConptyAgent) : null;
}

function hasMethod(value: unknown, name: string): boolean {
  return isRecord(value) && typeof value[name] === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
