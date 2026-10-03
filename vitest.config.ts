import { tmpdir } from "node:os";
import { defineConfig } from "vitest/config";
import type { TestProjectInlineConfiguration } from "vitest/config";
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

// Real-machine suites only exist when explicitly asked for: they spawn the
// built CLI and read the machine's real tools.
const isE2eEnabled = process.env["GUP_E2E"] === "1";

export default defineConfig({
  test: {
    reporters: ["default"],
    globalSetup: ["tests/support/node-guard.ts", "tests/support/sandbox-teardown.ts"],
    // Every tests/**/*.test.ts file belongs to exactly one project
    // (tests/support/self-test/project-membership.test.ts holds the line).
    projects: [
      project({
        name: "unit",
        include: ["tests/{core,commands,ui,security,scripts,cli}/**/*.test.ts"],
      }),
      // Transitional: the flat provider suites, each mocking the runner on its
      // own. Removed once every domain has moved to the contract harness.
      project({ name: "providers-legacy", include: ["tests/providers/*.test.ts"] }),
      project({
        name: "providers",
        include: [
          "tests/providers/*/**/*.test.ts",
          "tests/platform/**/*.test.ts",
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
      ...(isE2eEnabled
        ? [
            project({
              name: "e2e",
              include: ["tests/e2e/**/*.e2e.test.ts"],
              testTimeout: 120_000,
              fileParallelism: false,
              retry: 1,
            }),
          ]
        : []),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli.ts",
        "src/pty-exec.ts",
        "src/**/_template.ts",
        "src/**/*.d.ts",
        "src/ui/**",
        "src/commands/menu.ts",
      ],
      clean: true,
      // The global gate stays until the coverage policy replaces it with
      // floors on the safety-critical modules: dropping it first would leave
      // every branch merged in between ungated.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
