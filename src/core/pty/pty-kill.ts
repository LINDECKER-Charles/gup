import { killProcessTree } from "../runner.js";

/** execa's `forceKillAfterDelay` default: SIGTERM, then SIGKILL this long after (POSIX). */
const KILL_GRACE_MS = 5_000;
/** How often a terminated group is checked for survivors during the grace period. */
const GROUP_POLL_MS = 100;

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
  /**
   * Kill the tree; resolves once nothing of it is left, never rejects. On
   * POSIX the group gets SIGTERM, then SIGKILL if anything of it outlives the
   * grace period: the trampoline dies at once, but an installer under it may
   * be rolling back (npm) or stuck on a download that never ends — and once
   * the trampoline is gone, nothing else would ever end it.
   */
  async terminate(pid: number): Promise<void> {
    if (process.platform === "win32") return killProcessTree(pid);
    if (!isGroupLeader(pid)) return;
    signalGroup(pid, "SIGTERM");
    if (await groupEndsWithin(pid, KILL_GRACE_MS)) return;
    signalGroup(pid, "SIGKILL");
  },
};

/** A pid whose negation names one process group — never 0 or below (ours, or every process). */
function isGroupLeader(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0;
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: the group is already gone. Never throw from a kill.
  }
}

/** Signal 0 only checks: ESRCH means no process of the group is left. */
function isGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function groupEndsWithin(pid: number, graceMs: number): Promise<boolean> {
  for (let waited = 0; waited < graceMs; waited += GROUP_POLL_MS) {
    if (!isGroupAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS));
  }
  return !isGroupAlive(pid);
}
