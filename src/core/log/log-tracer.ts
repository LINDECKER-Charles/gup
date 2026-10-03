import type {
  CommandMode,
  CommandTrace,
  CommandTracer,
  TracedResult,
} from "../process/command-tracer.js";
import { log, type LogInput, type LogLevel } from "./log.js";
import { redactArgv, redactedTail, redactText, TAIL_MARKER } from "./redact.js";
import { MAX_STRING } from "./sanitize-data.js";

/**
 * The debug log's view of every command gup runs, installed in the runner's
 * tracer slot. Probes (version checks, `outdated` listings) are frequent and
 * quiet: their start is `trace`, their end `debug`, with the stderr tail of a
 * failed one — the line that explains a provider's scan error. Installs are
 * rare and matter: `info` at both ends, `warn` when they fail or time out.
 */

/**
 * Tails stay under the log's per-string cap ({@link MAX_STRING}), which keeps
 * the *start* of a longer string: a longer tail would lose its last lines,
 * the ones that explain the failure.
 */
const LONG_TAIL = MAX_STRING - TAIL_MARKER.length;
const STDERR_TAIL = LONG_TAIL;
const STDOUT_TAIL = LONG_TAIL / 2;
/** What an install sink (embedded terminal, scheduled run) kept of the output. */
const OUTPUT_TAIL = LONG_TAIL;

const NOOP_TRACE: CommandTrace = { end: () => {} };

interface TraceSubject {
  readonly mode: CommandMode;
  readonly cmd: string;
  readonly args: readonly string[];
}

export function createLogTracer(): CommandTracer {
  return (mode, command, args) => {
    const isProbe = mode === "probe";
    // Nothing is computed for a command whose end would not be recorded.
    if (!log.isEnabled(isProbe ? "debug" : "warn")) return NOOP_TRACE;
    const subject: TraceSubject = { mode, cmd: redactText(command), args: redactArgv(args) };
    log[isProbe ? "trace" : "info"]("cmd.start", { ...subject });
    const startedAt = Date.now();
    return { end: (result) => endTrace(subject, result, Date.now() - startedAt) };
  };
}

function endTrace(subject: TraceSubject, result: TracedResult, ms: number): void {
  const isProbe = subject.mode === "probe";
  const isFailure = result.failed || result.timedOut === true;
  const level: LogLevel = isProbe ? "debug" : isFailure ? "warn" : "info";
  log[level]("cmd.end", {
    ...subject,
    exitCode: result.exitCode,
    ms,
    failed: result.failed,
    ...(result.timedOut === true && { timedOut: true }),
    ...(result.aborted === true && { aborted: true }),
    ...(isProbe ? probeOutput(result) : sinkOutput(result)),
  });
}

/** The stderr tail of a failed probe; the stdout tail too, at `trace`. */
function probeOutput(result: TracedResult): LogInput {
  const { failed, stderr, stdout } = result;
  return {
    ...(failed && stderr && { stderrTail: redactedTail(stderr, STDERR_TAIL) }),
    ...(stdout && log.isEnabled("trace") && { stdoutTail: redactedTail(stdout, STDOUT_TAIL) }),
  };
}

/** An install's output went to the terminal; a sink (PTY, pipe) may have kept its tail. */
function sinkOutput(result: TracedResult): LogInput {
  return result.stdout ? { outputTail: redactedTail(result.stdout, OUTPUT_TAIL) } : {};
}

