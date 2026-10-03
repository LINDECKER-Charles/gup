import { killProcessTree } from "../runner.js";

/**
 * How the process tree under a pseudo-terminal is killed. Never through
 * node-pty's own `IPty.kill()`: on Windows it forks a console-list agent that
 * crashed with `AttachConsole failed` and printed its stack trace on gup's
 * stderr — over the full-screen app. The pid is the trampoline's: on Windows
 * `taskkill /T /F` takes it down with the installer it started; on POSIX
 * node-pty started it as a session leader, so its process group holds the
 * whole tree.
 */
export const ptyKill = {
  /** First, polite attempt (POSIX) — already final on Windows (`/F`). */
  terminate(pid: number): void {
    if (process.platform === "win32") killProcessTree(pid);
    else signalGroup(pid, "SIGTERM");
  },
  /** After the grace period: SIGKILL the group (POSIX); nothing left to do on Windows. */
  force(pid: number): void {
    if (process.platform !== "win32") signalGroup(pid, "SIGKILL");
  },
};

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: the group is already gone. Never throw from a kill.
  }
}
