import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { FIXTURE_CLOCK } from "./fixtures/clock.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * The screenshot generator, hosted by vitest for its fake timers, its
 * TypeScript transform (the same as the UI suites) and a mode switch that
 * works in every shell: `vitest run --config … --mode check`. It is not part
 * of gup's test suite (the root config never matches `*.screens.ts`).
 */
export default defineConfig(({ mode }) => ({
  root: ROOT,
  test: {
    include: ["scripts/screenshots/capture.screens.ts"],
    // One line per scene: which one failed, or that each was rendered.
    reporters: ["verbose"],
    setupFiles: ["scripts/screenshots/setup.ts"],
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    // A scene mounts the whole app; a loaded machine needs the margin.
    testTimeout: 30_000,
    // OpenTUI loads its renderer through node:ffi, still flagged experimental.
    execArgv: ["--disable-warning=ExperimentalWarning"],
    env: {
      SCREENSHOTS_MODE: mode === "check" ? "check" : "write",
      // Assigned inside the worker, where Node honours it on every OS.
      TZ: FIXTURE_CLOCK.timeZone,
    },
  },
}));
