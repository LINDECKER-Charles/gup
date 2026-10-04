import { isDroppedFromShell, SANDBOX_ROOT_VAR, workerSandboxEnv } from "./test-env.js";

/**
 * setupFile of every vitest project. Drops the developer's shell variables
 * that change what gup does or draws (gup's own, the colour switches), then
 * moves the sandbox directory overrides of `test.env` from the run's root to
 * this worker's own directory, so that two files running in parallel never
 * share a stray writer's target.
 *
 * Idempotent on purpose: `process.env` outlives the per-file module isolation,
 * so the value is always derived from the untouched root, never from the
 * previous file's result.
 */
const root = process.env[SANDBOX_ROOT_VAR];
if (!root) {
  throw new Error(
    `${SANDBOX_ROOT_VAR} is not set: run the tests through vitest.config.ts, which sandboxes ` +
      "every directory gup writes to.",
  );
}
for (const name of Object.keys(process.env)) {
  if (isDroppedFromShell(name)) delete process.env[name];
}
Object.assign(process.env, workerSandboxEnv(root, process.env["VITEST_POOL_ID"] ?? "0"));
