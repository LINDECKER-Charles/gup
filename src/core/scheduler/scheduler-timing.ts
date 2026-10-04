import { DEFAULT_INSTALL_TIMEOUT_S } from "../runner.js";

/**
 * The scheduler's time budget, in one place because its values only make
 * sense together: a tick wakes every {@link TICK_INTERVAL_MINUTES}, stops
 * starting installs after {@link MAX_RUN_MINUTES}, lets the install in
 * flight finish within {@link SCHEDULED_INSTALL_CAP_S}, and exits on its own
 * watchdog before Windows' Task Scheduler would kill it.
 *
 *     MAX_RUN_MINUTES + cap  <  TICK_WATCHDOG_MINUTES  <  EXECUTION_TIME_LIMIT_MINUTES
 *          120 + 30          <          170           <             180
 */

const MINUTE_MS = 60_000;

/** How often the OS trigger starts a tick: latency against wake-ups. */
export const TICK_INTERVAL_MINUTES = 15;

/** A late tick (sleep, a busy machine) still runs an occurrence "on time" within this. */
export const ON_TIME_GRACE_MS = 2 * TICK_INTERVAL_MINUTES * MINUTE_MS;

/** Right after boot, network and logon are still settling: the next tick does the work. */
export const BOOT_GRACE_SECONDS = 300;

/** "Every scan failed" postponements of an occurrence — about an hour — before reporting it. */
export const MAX_DEFERRALS = 4;

/** No install starts after this much of a run. */
export const MAX_RUN_MINUTES = 120;

/** Per-install ceiling in scheduled runs, whatever the interactive setting says. */
export const SCHEDULED_INSTALL_CAP_S = 1800;
/** …and floor: a scheduled install always gets at least a minute. */
export const SCHEDULED_INSTALL_FLOOR_S = 60;

/** A tick still alive after this exits on its own (POSIX has no execution time limit). */
export const TICK_WATCHDOG_MINUTES = 170;

/** Windows Task Scheduler's ExecutionTimeLimit for the trigger task. */
export const EXECUTION_TIME_LIMIT_MINUTES = 180;

/** No heartbeat for three ticks means the trigger no longer fires. */
export const HEARTBEAT_STALE_MINUTES = 3 * TICK_INTERVAL_MINUTES;

/**
 * The install timeout a scheduled run applies: the interactive setting
 * clamped into [floor, cap], and the default when the setting disables it
 * (0) — nobody is there to skip a wedged installer by hand.
 */
export function scheduledInstallTimeout(settingSeconds: number): number {
  const wanted = settingSeconds === 0 ? DEFAULT_INSTALL_TIMEOUT_S : settingSeconds;
  return Math.max(SCHEDULED_INSTALL_FLOOR_S, Math.min(wanted, SCHEDULED_INSTALL_CAP_S));
}
