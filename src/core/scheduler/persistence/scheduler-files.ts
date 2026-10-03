import { rmdirSync, rmSync } from "node:fs";
import { pathFlavour } from "../../platform/path-flavour.js";
import { stateDir, type DirContext } from "../../state/app-dirs.js";

/**
 * Where the scheduler keeps its files: the machine-local state dir
 * `stateDir("scheduler")` (`%LOCALAPPDATA%\gup\scheduler`,
 * `~/Library/Application Support/gup/scheduler`, `$XDG_STATE_HOME/gup/scheduler`,
 * or `$GUP_SCHEDULER_DIR`). Schedules name this machine's packages, so none
 * of it roams with the user's profile.
 */

export interface SchedulerFiles {
  readonly dir: string;
  /** The schedules, written by interactive commands only. */
  readonly schedules: string;
  /** Run state and heartbeat, written by runs. */
  readonly state: string;
  /** What was registered with the OS, and from which gup. */
  readonly install: string;
  /** launchd's stderr for the agent (macOS). */
  readonly agentStderr: string;
}

const FILE_NAMES = {
  schedules: "schedules.json",
  state: "state.json",
  install: "install.json",
  agentStderr: "agent-stderr.log",
} as const;

/** Lock files the config store and the state store leave next to their files. */
const LOCK_SUFFIX = ".lock";

/** The scheduler's files for `context`, or null when the platform gives no state dir. */
export function schedulerFiles(context: Partial<DirContext> = {}): SchedulerFiles | null {
  const dir = stateDir("scheduler", context);
  if (dir === null) return null;
  const { join } = pathFlavour(context.platform ?? process.platform);
  return {
    dir,
    schedules: join(dir, FILE_NAMES.schedules),
    state: join(dir, FILE_NAMES.state),
    install: join(dir, FILE_NAMES.install),
    agentStderr: join(dir, FILE_NAMES.agentStderr),
  };
}

/**
 * Delete every file the scheduler wrote, then the directory if nothing else
 * lives there (a `GUP_SCHEDULER_DIR` may point at a folder the user shares).
 */
export function purgeSchedulerFiles(files: SchedulerFiles): void {
  for (const file of [files.schedules, files.state, files.install, files.agentStderr]) {
    rmSync(file, { force: true });
    rmSync(`${file}${LOCK_SUFFIX}`, { force: true });
  }
  try {
    rmdirSync(files.dir);
  } catch {
    // Not empty (the batch lock's display file, the user's own files) or already gone.
  }
}
