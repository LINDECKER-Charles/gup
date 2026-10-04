import { elevatedLogBuffer } from "../../core/log/elevated-bridge.js";
import { FileSink, RETENTION_ENV, retentionDaysOf } from "../../core/log/file-sink.js";
import {
  effectiveLogThreshold,
  installLogBackend,
  log,
  type LogThreshold,
} from "../../core/log/log.js";
import { formatLogLine, SinkLogBackend } from "../../core/log/log-backend.js";
import { createLogTracer } from "../../core/log/log-tracer.js";
import type { LogSink } from "../../core/log/types.js";
import { createUpdateLogObserver } from "../../core/log/update-log-observer.js";
import { setCommandTracer } from "../../core/process/command-tracer.js";
import { stateDir } from "../../core/state/app-dirs.js";
import { runTrigger } from "../../core/state/run-context.js";
import { systemSnapshot } from "../../core/state/system-snapshot.js";
import { observeUpdates } from "../../core/update/update-extensions.js";
import type { SettingView } from "../../ui/settings/settings-sources.js";
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
 * module before the command runs. It fills three slots — the log backend,
 * the runner's command tracer, an update observer — and records the
 * session's start, end and crash.
 *
 * Nothing is installed when the log is off (`GUP_LOG_LEVEL=off`) or when the
 * command reads the log: not a file is opened. The elevated child always gets
 * its memory backend, because its threshold arrives later, in the payload,
 * and it never reads the user's settings.
 *
 * A command that writes the log file follows the `log.level` setting while
 * it runs: changed in the Options view, it applies at once, unless
 * `--log-level` or `GUP_LOG_LEVEL` decided the threshold.
 */

export interface LogSession {
  readonly settings: LogSettings;
  /** Where the records actually go ("none" when nothing was installed). */
  readonly sink: LogSinkKind;
  /** The log directory the file sink writes to, when it does. */
  readonly dir: string | null;
  readonly backend: SinkLogBackend | null;
}

export interface LogSessionRequest {
  /** `--log-level`, already validated. */
  readonly flag?: LogThreshold | undefined;
  /**
   * The `log.level` setting. Asked for only by a command that writes the log
   * file: never by the elevated child, nor by `gup log`, which writes nothing.
   */
  readonly setting?: () => SettingView<LogThreshold>;
}

/** One startup's inputs, kept to decide again when the setting changes. */
interface Decision {
  readonly context: StartupContext;
  readonly flag: LogThreshold | undefined;
  readonly setting: SettingView<LogThreshold> | null;
}

let session: LogSession | null = null;
let uninstall: (() => void) | null = null;
let unfollow: (() => void) | null = null;

/** Decide and install this process's log, replacing any previous one. */
export function startLogSession(context: StartupContext, request: LogSessionRequest = {}): void {
  stopLogSession();
  const writesFile = sinkKindFor(context.commandPath) === "file";
  const setting = writesFile ? (request.setting?.() ?? null) : null;
  const decision: Decision = { context, flag: request.flag, setting };
  open(decision, settingsOf(decision));
  unfollow = setting?.subscribe(() => follow(decision)) ?? null;
}

/** This process's log, or null before the startup ran. */
export function currentLogSession(): LogSession | null {
  return session;
}

/**
 * What this process's log records and what decided it; before the startup
 * ran, the backend's threshold and "default".
 */
export function currentLogLevel(): Pick<LogSettings, "threshold" | "source"> {
  const settings = session?.settings;
  return {
    threshold: settings?.threshold ?? effectiveLogThreshold(),
    source: settings?.source ?? "default",
  };
}

/**
 * Remove every slot the session filled, stop following the setting and close
 * the file. The CLI never needs it (the process exit does it); tests do,
 * between cases.
 */
export function stopLogSession(): void {
  unfollow?.();
  unfollow = null;
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

function settingsOf({ flag, setting }: Decision): LogSettings {
  return resolveLogSettings({
    flag,
    env: process.env,
    setting: setting?.current(),
    trigger: runTrigger(),
  });
}

/** Install the log `settings` ask for — nothing at all when it is off — and record its start. */
function open(decision: Decision, settings: LogSettings): void {
  const { context } = decision;
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

/**
 * The setting changed: decide again. A threshold the flag or the environment
 * set does not move. A log that was off starts now, with its `session.start`;
 * one turned down (off included) records the change, then stays open and
 * records only what the new level lets through.
 */
function follow(decision: Decision): void {
  const current = session;
  if (current === null) return;
  const next = settingsOf(decision);
  const { threshold, source } = current.settings;
  if (next.threshold === threshold && next.source === source) return;
  if (current.backend === null) {
    open(decision, next);
    return;
  }
  session = { ...current, settings: next };
  changeThreshold(current.backend, next);
}

/**
 * Move the backend to `next`'s threshold, recording `log.threshold` under the
 * louder of the old and the new one: a log turned down still says why it
 * went quiet.
 */
function changeThreshold(backend: SinkLogBackend, next: LogSettings): void {
  const data = { threshold: next.threshold, source: next.source };
  const isRecordedBefore = backend.isEnabled("info");
  if (isRecordedBefore) log.info("log.threshold", data);
  backend.setThreshold(next.threshold);
  if (!isRecordedBefore) log.info("log.threshold", data);
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
