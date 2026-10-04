import { setTimeout as delay } from "node:timers/promises";
import headless, { type Terminal } from "@xterm/headless";
import type { InheritExit } from "../../../src/core/process/inherit-sink.js";
import {
  detectEmbeddedTerminal,
  type EmbeddedTerminalSupport,
  type PtyModule,
} from "../../../src/core/pty/pty-loader.js";
import { PtySession as PtyProcess } from "../../../src/core/pty/pty-session.js";
import { CLI_ENTRY, TRAMPOLINE_ENTRY } from "./cli.js";
import { inheritedEnv, type Sandbox } from "./sandbox.js";

/**
 * The built CLI in a real pseudo-terminal (ConPTY on Windows), read the way a
 * terminal shows it: node-pty runs `node dist/cli.js`, @xterm/headless
 * interprets everything it draws, and the suites read the screen as text.
 *
 * The child process is gup's own `PtySession`, so the harness ends a session
 * exactly as gup ends an install: the tree killed through `ptyKill`, the
 * pseudo-console released once node-pty reports the exit — never node-pty's
 * `IPty.kill()` (amendment X-3).
 */

/** What a terminal sends for each key the suites press (letters go through `type`). */
const KEY_SEQUENCES = {
  enter: "\r",
  space: " ",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  "ctrl+c": "\x03",
} as const;

export type E2eKey = keyof typeof KEY_SEQUENCES;

/** Between two keys: enough for the app to read each one alone. */
const KEY_GAP_MS = 60;
/** The size a session starts at; `resize` changes it. */
const COLS = 100;
const ROWS = 30;
/** A first frame on a busy CI runner, or a scan of the sandbox's npm prefix. */
const SCREEN_WAIT_MS = 20_000;
const EXIT_WAIT_MS = 15_000;
const POLL_MS = 50;

export interface ScreenSnapshot {
  readonly buffer: "normal" | "alternate";
  /** One entry per row of the viewport, right-trimmed. */
  readonly lines: readonly string[];
  readonly text: string;
}

/**
 * The embedded terminal as the built CLI finds it in a sandbox: node-pty,
 * `dist/pty-exec.js`, and none of the shell's `GUP_*` switches — a `GUP_PTY=0`
 * there never reaches a sandboxed gup, so it must not turn the global setup's
 * report or the suites' skips off either.
 */
export function detectTerminal(): Promise<EmbeddedTerminalSupport> {
  return detectEmbeddedTerminal({
    env: inheritedEnv(),
    locate: () => ({ script: TRAMPOLINE_ENTRY, execArgv: [] }),
  });
}

/** `gup` — the interactive menu — in a 100×30 terminal. */
export class PtySession {
  readonly #terminal: Terminal;
  readonly #session: PtyProcess;
  /** Settles once xterm has parsed everything received so far. */
  #parsed: Promise<void> = Promise.resolve();
  #exit: InheritExit | null = null;

  private constructor(pty: PtyModule, sandbox: Sandbox) {
    this.#terminal = new headless.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
    const launch = { file: process.execPath, args: [CLI_ENTRY], cols: COLS, rows: ROWS };
    this.#session = PtyProcess.start(inSandbox(pty, sandbox), launch, (data) => this.#feed(data));
    // A terminal answers the queries an app sends (cursor position, device
    // attributes): forward those answers as a real one would.
    this.#terminal.onData((answer) => this.#session.write(answer));
    void this.#session.exited.then((exit) => (this.#exit = exit));
  }

  /** Throws when node-pty cannot start gup. */
  static start(pty: PtyModule, sandbox: Sandbox): PtySession {
    return new PtySession(pty, sandbox);
  }

  /** The screen once everything gup wrote so far has been interpreted. */
  async screen(): Promise<ScreenSnapshot> {
    await this.#parsed;
    const { cols, rows } = this.#terminal;
    const buffer = this.#terminal.buffer.active;
    // Clipped to the width: after a narrowing resize a line keeps the cells
    // it had beyond the new last column, which no longer show.
    const lines = Array.from(
      { length: rows },
      (_, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(true, 0, cols) ?? "",
    );
    return { buffer: buffer.type, lines, text: lines.join("\n") };
  }

  /** The first screen showing `pattern`; throws with the last screen when it never does. */
  waitForText(pattern: string | RegExp, timeoutMs?: number): Promise<ScreenSnapshot> {
    const isShown = (screen: ScreenSnapshot): boolean =>
      typeof pattern === "string" ? screen.text.includes(pattern) : pattern.test(screen.text);
    return this.waitForScreen(isShown, { what: String(pattern), ...(timeoutMs && { timeoutMs }) });
  }

  /** The first screen `isWanted` accepts; throws with the last screen when none does in time. */
  async waitForScreen(
    isWanted: (screen: ScreenSnapshot) => boolean,
    wait: { readonly what: string; readonly timeoutMs?: number },
  ): Promise<ScreenSnapshot> {
    const timeoutMs = wait.timeoutMs ?? SCREEN_WAIT_MS;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const snapshot = await this.screen();
      if (isWanted(snapshot)) return snapshot;
      if (this.#exit) throw new Error(`gup exited (${this.#exit.exitCode}) before ${wait.what}`);
      if (Date.now() > deadline) {
        throw new Error(`${wait.what} not on screen after ${timeoutMs} ms:\n${snapshot.text}`);
      }
      await delay(POLL_MS);
    }
  }

  /** Keys, one at a time, as a user types them. */
  async press(...keys: readonly E2eKey[]): Promise<void> {
    for (const key of keys) await this.type(KEY_SEQUENCES[key]);
  }

  /** Literal text (letters are commands in most views). */
  async type(text: string): Promise<void> {
    this.#session.write(text);
    await delay(KEY_GAP_MS);
  }

  resize(cols: number, rows: number): void {
    this.#terminal.resize(cols, rows);
    this.#session.resize(cols, rows);
  }

  /** gup's exit code; throws when it is still running after `timeoutMs`. */
  async exited(timeoutMs: number = EXIT_WAIT_MS): Promise<number> {
    const exit = await within(this.#session.exited, timeoutMs);
    if (exit === null) throw new Error(`gup still running ${timeoutMs} ms later`);
    await this.#parsed;
    return exit.exitCode;
  }

  /** Kill gup if it still runs, and wait for the pseudo-console to go. Never throws. */
  async dispose(): Promise<void> {
    this.#session.kill();
    await within(this.#session.exited, EXIT_WAIT_MS);
    this.#terminal.dispose();
  }

  #feed(data: string): void {
    const previous = this.#parsed;
    const parsed = new Promise<void>((resolve) => this.#terminal.write(data, resolve));
    this.#parsed = Promise.all([previous, parsed]).then(() => undefined);
  }
}

/** `promise`'s value, or null once `timeoutMs` passed first (the timer never outlives the call). */
async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  const timer = new AbortController();
  try {
    return await Promise.race([promise, delay(timeoutMs, null, { signal: timer.signal })]);
  } finally {
    timer.abort();
  }
}

/**
 * node-pty also takes the child's environment and working directory, which
 * gup's `PtySpawnOptions` leaves out (an install inherits gup's). The loader's
 * checked spawn hands the options object to node-pty as it is.
 */
function inSandbox(pty: PtyModule, sandbox: Sandbox): PtyModule {
  return {
    spawn(file, args, options) {
      const sandboxed = { ...options, env: sandbox.env, cwd: sandbox.root };
      return pty.spawn(file, args, sandboxed);
    },
  };
}
