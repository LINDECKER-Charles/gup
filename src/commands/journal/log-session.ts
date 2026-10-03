import { elevatedLogBuffer } from "../../core/log/elevated-bridge.js";
import { FileSink, RETENTION_ENV, retentionDaysOf } from "../../core/log/file-sink.js";
import { installLogBackend, log, type LogThreshold } from "../../core/log/log.js";
import { formatLogLine, SinkLogBackend } from "../../core/log/log-backend.js";
import { createLogTracer } from "../../core/log/log-tracer.js";
import type { LogSink } from "../../core/log/types.js";
import { createUpdateLogObserver } from "../../core/log/update-log-observer.js";
import { setCommandTracer } from "../../core/process/command-tracer.js";
import { stateDir } from "../../core/state/app-dirs.js";
import { runTrigger } from "../../core/state/run-context.js";
import { systemSnapshot } from "../../core/state/system-snapshot.js";
import { observeUpdates } from "../../core/update/update-extensions.js";
import { PromptCancelledError } from "../../ui/tui/prompt-cancelled.js";
import type { StartupContext } from "../cli/cli-module.js";
import {
  resolveLogSettings,
  sinkKindFor,
  type LogSettings,
  type LogSinkKind,
} from "./log-settings.js";

/**
 * The debug log of one gup process: decided and installed by the journal
 * module before the command runs, then left alone. It fills three slots —
 * the log backend, the runner's command tracer, an update observer — and
 * records the session's start, end and crash.
 *
 * Nothing is installed when the log is off (`GUP_LOG_LEVEL=off`) or when the
 * command reads the log: not a file is opened. The elevated child always gets
 * its memory backend, because its threshold arrives later, in the payload.
 */

export interface LogSession {
  readonly settings: LogSettings;
  /** Where the records actually go ("none" when nothing was installed). */
  readonly sink: LogSinkKind;
  /** The log directory the file sink writes to, when it does. */
  readonly dir: string | null;
  readonly backend: SinkLogBackend | null;
}

let session: LogSession | null = null;
let uninstall: (() => void) | null = null;

/** Decide and install this process's log, replacing any previous one. */
export function startLogSession(context: StartupContext, flag?: LogThreshold): void {
  stopLogSession();
  const settings = resolveLogSettings({ flag, env: process.env, trigger: runTrigger() });
  const requested = sinkKindFor(context.commandPath);
  // Off opens nothing; the elevated child keeps its memory backend whatever
  // its own environment says, since the parent's threshold arrives later.
  const kind = settings.threshold === "off" && requested === "file" ? "none" : requested;
  const dir = kind === "file" ? stateDir("logs") : null;
  const sink = sinkOf(kind, dir);
  const backend = sink ? new SinkLogBackend({ threshold: settings.threshold, sink }) : null;
  session = { settings, sink: backend ? kind : "none", dir, backend };
  if (!backend) return;
  uninstall = install(backend);
  log.info("session.start", {
    command: context.commandPath,
    trigger: runTrigger(),
    options: context.options,
    system: systemSnapshot(),
  });
}

/** This process's log, or null before the startup ran. */
export function currentLogSession(): LogSession | null {
  return session;
}

/**
 * Remove every slot the session filled and close its file. The CLI never
 * needs it (the process exit does it); tests do, between cases.
 */
export function stopLogSession(): void {
  uninstall?.();
  uninstall = null;
  session = null;
}

/** The crash hook: the error that is about to end the process, or a cancelled prompt. */
export function logCrash(error: unknown): void {
  if (error instanceof PromptCancelledError) {
    log.info("session.cancelled");
    return;
  }
  const reported = error instanceof Error ? error : { message: String(error) };
  log.error("session.crash", { error: reported });
}

function sinkOf(kind: LogSinkKind, dir: string | null): LogSink | null {
  if (kind === "memory") return elevatedLogBuffer;
  if (kind === "none" || dir === null) return null;
  return new FileSink({
    dir,
    retentionDays: retentionDaysOf(process.env[RETENTION_ENV]),
    cappedLine: (day) => formatLogLine("warn", "log.capped", { day }),
  });
}

function install(backend: SinkLogBackend): () => void {
  installLogBackend(backend);
  setCommandTracer(createLogTracer());
  const unobserve = observeUpdates(createUpdateLogObserver());
  const startedAt = Date.now();
  const onExit = (code: number): void => {
    log.info("session.end", { code, ms: Date.now() - startedAt });
  };
  process.once("exit", onExit);
  return () => {
    process.off("exit", onExit);
    unobserve();
    setCommandTracer(null);
    installLogBackend(null);
    backend.close();
  };
}
