import chalk from "chalk";
import { activeInheritSink } from "./inherit-sink.js";

/**
 * Where a line gup prints on its own goes, in order of precedence:
 *
 * 1. into the active install sink (the embedded terminal pane, the scheduled
 *    run's log), so it shows next to the install it belongs to;
 * 2. while a full-screen app is mounted, nowhere for now: it is printed on
 *    stderr when the process exits. A write to the terminal while OpenTUI
 *    owns it would paint over the frame, and on conhost 10.0.26100 output in
 *    the middle of the screen's lifecycle is exactly what the teardown order
 *    in `ui/tui/teardown.ts` protects against;
 * 3. otherwise straight to the terminal: informational lines on stdout,
 *    warnings on stderr so `gup list --json` keeps a clean stdout.
 *
 * Lines are passed without a trailing newline.
 */

let isFullScreen = false;
const deferredLines: string[] = [];
let isExitHookInstalled = false;

export const installConsole = {
  /** An informational line (a download URL, a files-installed count). */
  log(line: string): void {
    route(line, (text) => process.stdout.write(`${text}\n`));
  },
  /** Something went wrong on gup's side but the run goes on (history not written). */
  warn(line: string): void {
    route(line, (text) => process.stderr.write(`${chalk.dim(text)}\n`));
  },
};

/** Tell the router a full-screen app is mounted (true) or gone (false). Called by the screen host only. */
export function setFullScreen(isActive: boolean): void {
  isFullScreen = isActive;
}

/** Print `line` (dimmed, on stderr) when the process exits, after any screen is gone. */
export function deferUntilExit(line: string): void {
  deferredLines.push(line);
  if (isExitHookInstalled) return;
  isExitHookInstalled = true;
  process.once("exit", flushDeferred);
}

function route(line: string, write: (text: string) => void): void {
  const sink = activeInheritSink();
  if (sink) return sink.note(line);
  if (isFullScreen) return deferUntilExit(line);
  write(line);
}

function flushDeferred(): void {
  for (const line of deferredLines.splice(0)) {
    process.stderr.write(`${chalk.dim(line)}\n`);
  }
}
