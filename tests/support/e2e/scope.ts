/**
 * What an end-to-end run covers, read from the environment the run was
 * started with (`tests/e2e/opt-in*.env`, or `env:` in CI):
 *
 * - `GUP_E2E=1` declares the `e2e` vitest project at all;
 * - `GUP_E2E_SCOPE=smoke` keeps it to `tests/e2e/smoke/` (no network, no
 *   real provider scanned: what every pull request runs on every OS); any
 *   other value, or none, runs every suite;
 * - `GUP_MUTATE=1` lets the suites that change something real — always
 *   sandboxed: a throw-away npm prefix, a `gup-it-<random>` scheduled task —
 *   run instead of skipping.
 */

export type E2eScope = "smoke" | "full";

const SMOKE = "smoke";

/** The project's test files for `scope`. */
export const E2E_SUITES: Readonly<Record<E2eScope, string>> = {
  smoke: "tests/e2e/smoke/**/*.e2e.test.ts",
  full: "tests/e2e/**/*.e2e.test.ts",
};

export function isE2eEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GUP_E2E"] === "1";
}

export function e2eScope(env: NodeJS.ProcessEnv = process.env): E2eScope {
  return env["GUP_E2E_SCOPE"]?.trim().toLowerCase() === SMOKE ? "smoke" : "full";
}

export function isMutateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GUP_MUTATE"] === "1";
}

/**
 * Where node-pty must load. Windows and macOS install it from prebuilds, so
 * a missing embedded terminal there is a bug the suites report; Linux builds
 * it from source and may legitimately run without it (the fallback).
 */
export function isPtyRequired(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" || platform === "darwin";
}
