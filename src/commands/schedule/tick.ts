import chalk from "chalk";
import { uptime } from "node:os";
import { log } from "../../core/log/log.js";
import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../core/runner.js";
import {
  ensureSchedulerDir,
  trimAgentStderr,
} from "../../core/scheduler/persistence/scheduler-files.js";
import { ScheduledRun } from "../../core/scheduler/scheduled-run.js";
import {
  BOOT_GRACE_SECONDS,
  scheduledInstallTimeout,
  TICK_WATCHDOG_MINUTES,
} from "../../core/scheduler/scheduler-timing.js";
import { applyCapturedEnv } from "../../core/scheduler/trigger/captured-env.js";
import { buildRunDeps } from "./run-deps.js";
import { schedulerServices, type SchedulerServices } from "./scheduler-services.js";

/**
 * `gup __schedule-tick`, started by the OS trigger every 15 minutes, with
 * no one watching: no prompt can ever wait (under `conhost --headless`
 * stdin and stdout *are* TTYs, so the guard is an explicit flag), no colour
 * codes, nothing right after boot, the user's captured environment on
 * macOS/Linux, a neutral working directory (Task Scheduler starts in
 * System32), the install timeout clamped, a graceful stop on SIGTERM and
 * kin, and a watchdog. The exit code is informative only: Task Scheduler
 * never sees it through conhost; results live in state.json and the log.
 */

export interface ScheduledTick {
  tick(): Promise<{ readonly kind: string }>;
  stop(): void;
}

/** The process around a tick, injectable so tests never touch the real one. */
export interface TickRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly uptimeSeconds: () => number;
  readonly services: () => SchedulerServices | { readonly error: string };
  readonly createRun: (services: SchedulerServices) => ScheduledTick;
  /** Call `handler` on a stop signal; returns the unsubscribe. */
  readonly onStopSignal: (handler: () => void) => () => void;
  readonly chdir: (dir: string) => void;
  readonly exit: (code: number) => void;
}

const MINUTE_MS = 60_000;
/** After a stop signal, the run gets this long to record its results. */
const STOP_GRACE_MS = 30_000;
const FAILURE_EXIT_CODE = 1;
const POSIX_STOP_SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
/** Ctrl+Break and a closed console window too. */
const WINDOWS_STOP_SIGNALS: readonly NodeJS.Signals[] = [...POSIX_STOP_SIGNALS, "SIGBREAK"];

const PROCESS_TICK_RUNTIME: TickRuntime = {
  env: process.env,
  platform: process.platform,
  uptimeSeconds: uptime,
  services: schedulerServices,
  createRun: (services) => new ScheduledRun(buildRunDeps(services)),
  onStopSignal: (handler) => {
    const signals = process.platform === "win32" ? WINDOWS_STOP_SIGNALS : POSIX_STOP_SIGNALS;
    for (const signal of signals) process.on(signal, handler);
    return () => {
      for (const signal of signals) process.off(signal, handler);
    };
  },
  chdir: (dir) => process.chdir(dir),
  exit: (code) => process.exit(code),
};

export async function runTick(runtime: TickRuntime = PROCESS_TICK_RUNTIME): Promise<number> {
  runtime.env["GUP_NONINTERACTIVE"] = "1";
  chalk.level = 0;
  if (runtime.uptimeSeconds() < BOOT_GRACE_SECONDS) {
    log.debug("scheduler.tick-boot-grace", { uptime: runtime.uptimeSeconds() });
    return 0;
  }
  const services = runtime.services();
  if ("error" in services) {
    log.error("scheduler.tick-unavailable", { reason: services.error });
    return FAILURE_EXIT_CODE;
  }
  prepare(services, runtime);
  return execute(runtime.createRun(services), runtime);
}

/** The environment a scheduled run needs before anything spawns. */
function prepare(services: SchedulerServices, runtime: TickRuntime): void {
  ensureSchedulerDir(services.files);
  runtime.chdir(services.files.dir);
  if (runtime.platform !== "win32") {
    applyCapturedEnv(services.installs.read()?.env ?? {}, runtime.env);
  }
  if (runtime.platform === "darwin") trimAgentStderr(services.files);
  setInstallTimeoutSeconds(scheduledInstallTimeout(getInstallTimeoutSeconds()));
}

async function execute(run: ScheduledTick, runtime: TickRuntime): Promise<number> {
  const stopOnSignal = runtime.onStopSignal(() => {
    log.warn("scheduler.tick-stop-requested");
    run.stop();
    setTimeout(() => runtime.exit(FAILURE_EXIT_CODE), STOP_GRACE_MS).unref();
  });
  const watchdog = setTimeout(() => {
    log.error("scheduler.tick-watchdog", { minutes: TICK_WATCHDOG_MINUTES });
    runtime.exit(FAILURE_EXIT_CODE);
  }, TICK_WATCHDOG_MINUTES * MINUTE_MS);
  watchdog.unref();
  try {
    const outcome = await run.tick();
    log.info("scheduler.tick-done", { outcome: outcome.kind });
    return 0;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("scheduler.tick-crashed", { error });
    return FAILURE_EXIT_CODE;
  } finally {
    stopOnSignal();
    clearTimeout(watchdog);
  }
}
