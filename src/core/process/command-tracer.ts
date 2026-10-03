import type { SinkMode } from "./inherit-sink.js";

/**
 * A slot for whoever wants to know about every command gup runs (the debug
 * log). The runner reports each spawn here; with no tracer installed, tracing
 * costs one null check. A tracer is installed by a CLI module's startup hook,
 * never by library code.
 */

/** How the command ran: a captured probe, an install on the terminal, or in a sink. */
export type CommandMode = "probe" | "inherit" | SinkMode;

export interface TracedResult {
  readonly exitCode: number;
  readonly failed: boolean;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
  /** Captured output (a probe), or the visible tail an install sink retained. */
  readonly stdout?: string;
  readonly stderr?: string;
}

export interface CommandTrace {
  end(result: TracedResult): void;
}

export type CommandTracer = (
  mode: CommandMode,
  command: string,
  args: readonly string[],
) => CommandTrace;

const NOOP_TRACE: CommandTrace = { end: () => {} };

let tracer: CommandTracer | null = null;

/** Install the process-wide tracer; null removes it. */
export function setCommandTracer(next: CommandTracer | null): void {
  tracer = next;
}

/**
 * Start tracing one command (already sanitised by the runner). Never throws:
 * a broken tracer must not turn into a failed install.
 */
export function traceCommand(
  mode: CommandMode,
  command: string,
  args: readonly string[],
): CommandTrace {
  if (!tracer) return NOOP_TRACE;
  try {
    const trace = tracer(mode, command, args);
    return {
      end: (result) => {
        try {
          trace.end(result);
        } catch {
          // Same contract as above: tracing is best-effort.
        }
      },
    };
  } catch {
    return NOOP_TRACE;
  }
}
