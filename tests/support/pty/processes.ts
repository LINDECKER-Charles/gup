import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Process-table queries for the PTY integration suites: which children a
 * process still has (Windows: CIM `Win32_Process`, which also lists the
 * conhost.exe a pseudo-console runs in; POSIX: `ps`), and whether a pid is
 * alive. Read-only — nothing here kills or starts anything but the query.
 */

const run = promisify(execFile);

export interface ProcessEntry {
  readonly pid: number;
  readonly name: string;
}

/** Whatever the query itself spawned (PowerShell, ps) is left out. */
export async function childProcessesOf(parentPid: number): Promise<ProcessEntry[]> {
  const isWindows = process.platform === "win32";
  const entries = isWindows ? await windowsChildren(parentPid) : await posixChildren(parentPid);
  return entries.filter((entry) => !QUERY_TOOLS.test(entry.name));
}

/** By base name: macOS's `ps` reports the full path of each command. */
const QUERY_TOOLS = /(?:^|[\\/])(?:powershell(?:\.exe)?|ps)$/i;

async function windowsChildren(parentPid: number): Promise<ProcessEntry[]> {
  const script =
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid}" | ` +
    "ForEach-Object { \"$($_.ProcessId) $($_.Name)\" }";
  const args = ["-NoProfile", "-NonInteractive", "-Command", script];
  const { stdout } = await run("powershell.exe", args, { windowsHide: true });
  return parseEntries(stdout);
}

async function posixChildren(parentPid: number): Promise<ProcessEntry[]> {
  const { stdout } = await run("ps", ["-A", "-o", "pid=,ppid=,comm="]);
  return stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([, ppid]) => Number(ppid) === parentPid)
    .map(([pid, , ...name]) => ({ pid: Number(pid), name: name.join(" ") }));
}

function parseEntries(stdout: string): ProcessEntry[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ...name] = line.split(" ");
      return { pid: Number(pid), name: name.join(" ") };
    });
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists, it just is not ours to signal.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Poll `check` until it returns true, or fail after `timeoutMs`. */
export async function eventually(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const step = 100;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition still false after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, step));
  }
}
