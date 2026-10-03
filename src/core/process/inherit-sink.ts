/**
 * Where an install's process attaches. By default `runInherit` hands the
 * user's terminal to the installer (`stdio: "inherit"`). A sink replaces that
 * terminal for a while: the embedded terminal pane of the full-screen app, or
 * a line pipe for a scheduled run that has no terminal at all. Providers never
 * see the difference — they keep calling `runInherit`, which asks the active
 * sink to start the child.
 */

/** How a sink attaches the child: a pseudo-terminal, or plain pipes. */
export type SinkMode = "pty" | "pipe";

/**
 * One install command, as `runInherit` hands it to a sink: built only AFTER the
 * command and argv went through the runner's sanitisers, so a sink never sees
 * an unchecked value.
 */
export interface InheritRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  /** Only the allowlisted shell-routed callsites (scoop's PowerShell shim) set it. */
  readonly shell?: boolean;
}

/** How a child ended. */
export interface InheritExit {
  readonly exitCode: number;
  readonly failed: boolean;
  /** The last visible output, when the sink retains it (a PTY pane does). */
  readonly outputTail?: string;
}

/** A started child. */
export interface InheritProcess {
  /** Resolves once the child is gone. Never rejects. */
  readonly exited: Promise<InheritExit>;
  /** Kill the child and its whole tree. Idempotent, never throws. */
  kill(): void;
}

export interface InheritSink {
  readonly mode: SinkMode;
  /** Must not throw: a spawn failure comes back as an already-exited, failed process. */
  start(request: InheritRequest): InheritProcess;
  /** A line from gup itself (not from a child), shown where the installs show. */
  note(line: string): void;
}

let activeSink: InheritSink | null = null;

/**
 * Send every `runInherit` to `sink` until the returned restore runs. Restore
 * is idempotent and puts back the sink that was active before, unless another
 * route has replaced this one since.
 */
export function routeInheritTo(sink: InheritSink): () => void {
  const previous = activeSink;
  activeSink = sink;
  let isRestored = false;
  return () => {
    if (isRestored) return;
    isRestored = true;
    if (activeSink === sink) activeSink = previous;
  };
}

/** The sink installs currently go to, or null for the user's terminal. */
export function activeInheritSink(): InheritSink | null {
  return activeSink;
}
