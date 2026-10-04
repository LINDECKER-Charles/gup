import { tmpdir } from "node:os";
import { configDefaults, defineConfig } from "vitest/config";
import type { TestProjectInlineConfiguration } from "vitest/config";
import { COVERAGE_FLOORS } from "./tests/support/coverage-floors.js";
import { E2E_SUITES, e2eScope, isE2eEnabled } from "./tests/support/e2e/scope.js";
import { sandboxRoot, sharedTestEnv } from "./tests/support/test-env.js";

type ProjectTest = NonNullable<TestProjectInlineConfiguration["test"]>;

const WORKER_SETUP = "tests/support/worker-setup.ts";

// Shared by every project. Spread explicitly rather than inherited through
// `extends: true`, which would also re-run the root global setups once per
// project.
const PROJECT_DEFAULTS = {
  environment: "node",
  clearMocks: true,
  // One sandbox per run: every directory gup may write to points under it
  // (tests/support/test-env.ts), and each worker moves to its own sub-directory.
  env: sharedTestEnv(sandboxRoot(tmpdir(), process.pid)),
  // The UI suites load OpenTUI, whose native renderer goes through
  // `node:ffi`; Node still flags it experimental, and the warning it prints
  // once per worker is noise in the test output.
  execArgv: ["--disable-warning=ExperimentalWarning"],
} satisfies ProjectTest;

type ProjectOptions = Omit<ProjectTest, "setupFiles"> & { readonly setupFiles?: readonly string[] };

function project(test: ProjectOptions): TestProjectInlineConfiguration {
  return {
    test: { ...PROJECT_DEFAULTS, ...test, setupFiles: [WORKER_SETUP, ...(test.setupFiles ?? [])] },
  };
}

/**
 * Security rules that only a provider on the fake machine can show (an id
 * refused before any spawn, a quote doubled in the argv): tests/security
 * still gathers every rule for `npm run test:security`, but these run in the
 * providers project, whose setup fakes the machine.
 */
const SECURITY_ON_THE_FAKE_MACHINE = "tests/security/providers/**/*.test.ts";

// Real-machine suites only exist when explicitly asked for: they spawn the
// built CLI and read the machine's real tools (tests/support/e2e/scope.ts).
const isE2e = isE2eEnabled();

// `reporters` is a root-only option: the E2E summary (a table for the CI job
// summary) only reports the e2e project's files.
const E2E_SUMMARY_REPORTER = "./tests/support/e2e/summary-reporter.ts";

export default defineConfig({
  test: {
    reporters: isE2e ? ["default", E2E_SUMMARY_REPORTER] : ["default"],
    globalSetup: ["tests/support/node-guard.ts", "tests/support/sandbox-teardown.ts"],
    // Every tests/**/*.test.ts file belongs to exactly one project
    // (tests/support/self-test/project-membership.test.ts holds the line).
    projects: [
      project({
        name: "unit",
        include: ["tests/{core,commands,ui,security,scripts,cli}/**/*.test.ts"],
        exclude: [...configDefaults.exclude, SECURITY_ON_THE_FAKE_MACHINE],
      }),
      project({
        name: "providers",
        include: [
          "tests/providers/*/**/*.test.ts",
          "tests/platform/**/*.test.ts",
          SECURITY_ON_THE_FAKE_MACHINE,
          "tests/support/self-test/**/*.test.ts",
        ],
        // The fake machine: runner, fs, os, platform, env and fetch.
        setupFiles: ["tests/support/system/install.ts"],
      }),
      project({
        name: "integration",
        include: ["tests/integration/**/*.test.ts"],
        // Real spawns: Defender and a long PATH make them slow on windows-latest.
        testTimeout: 30_000,
      }),
      ...(isE2e
        ? [
            project({
              name: "e2e",
              include: [E2E_SUITES[e2eScope()]],
              testTimeout: 120_000,
              // One real machine: two suites must not scan or update it at once.
              fileParallelism: false,
              // A real tool, the registry or a busy runner may stall once;
              // the suites that change something opt out (`retry: 0`).
              retry: 1,
              // Refuses a stale dist/, reports whether node-pty loaded.
              globalSetup: ["tests/support/e2e/global-setup.ts"],
            }),
          ]
        : []),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      // The entry point only wires commander, and the trampoline runs in a
      // child process the instrumentation never sees (tests/integration
      // exercises it).
      exclude: ["src/cli.ts", "src/pty-exec.ts", "src/**/_template.ts", "src/**/*.d.ts"],
      clean: true,
      // No global gate: floors on the safety-critical modules only.
      thresholds: { ...COVERAGE_FLOORS },
    },
  },
});
