import { join } from "node:path";

/**
 * Environment every test process starts from (vitest `test.env`).
 *
 * Rule: every persistent writer gup ships gets a kill switch or a directory
 * override here, defaulted off or pointed at a throw-away sandbox, so that no
 * suite can write into the developer's real profile by accident. The sandbox
 * directories are only a safety net: a test that actually writes creates its
 * own directory with `mkdtemp` and points the matching variable at it.
 */

/** Variable carrying the run's sandbox root from the config to the workers. */
export const SANDBOX_ROOT_VAR = "GUP_TEST_SANDBOX";

/** Directory overrides that receive a sandbox path, by sub-directory name. */
export const SANDBOX_DIR_VARS = {
  GUP_LOG_DIR: "logs",
  GUP_REPORT_DIR: "reports",
  GUP_SCHEDULER_DIR: "scheduler",
} as const;

export type SandboxDirVar = keyof typeof SANDBOX_DIR_VARS;

const SANDBOX_PREFIX = "gup-vitest-";

/**
 * `<tmp>/gup-vitest-<pid>`: unique per run, because two runs (watch mode next
 * to a CI script, two worktrees) must never share a sandbox.
 */
export function sandboxRoot(tmp: string, pid: number): string {
  return join(tmp, `${SANDBOX_PREFIX}${pid}`);
}

/**
 * `<root>/w<poolId>`: unique per worker, because the files of one run execute
 * in parallel workers and a stray writer in one must not race another. Nested
 * under the root so the run's teardown removes every worker's sandbox at once.
 */
export function workerSandbox(root: string, poolId: string): string {
  return join(root, `w${poolId}`);
}

function sandboxDirs(base: string): Readonly<Record<SandboxDirVar, string>> {
  return {
    GUP_LOG_DIR: join(base, SANDBOX_DIR_VARS.GUP_LOG_DIR),
    GUP_REPORT_DIR: join(base, SANDBOX_DIR_VARS.GUP_REPORT_DIR),
    GUP_SCHEDULER_DIR: join(base, SANDBOX_DIR_VARS.GUP_SCHEDULER_DIR),
  };
}

/** The `test.env` of the vitest config, built around the run's sandbox root. */
export function sharedTestEnv(root: string): Readonly<Record<string, string>> {
  return {
    // History and config stay off unless a suite points them at a temp dir.
    GUP_HISTORY: "0",
    GUP_CONFIG: "0",
    GUP_LOG_LEVEL: "off",
    // Date bucketing and report dates must not depend on the developer's zone.
    TZ: "UTC",
    [SANDBOX_ROOT_VAR]: root,
    ...sandboxDirs(root),
  };
}

/** Directory overrides of one worker, derived from the run's root (idempotent). */
export function workerSandboxEnv(
  root: string,
  poolId: string,
): Readonly<Record<SandboxDirVar, string>> {
  return sandboxDirs(workerSandbox(root, poolId));
}

/** Every variable `sharedTestEnv` sets: the fake system carries them into simulated envs. */
export const SHARED_ENV_KEYS: readonly string[] = Object.keys(sharedTestEnv(""));
