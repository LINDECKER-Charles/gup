import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    clearMocks: true,
    // The history writer is reached transitively by the command/ui suites and
    // writes to the real user profile. Off by default here; the suites that
    // actually exercise it re-enable it against a temp directory.
    env: { GUP_HISTORY: "0" },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli.ts",
        "src/**/_template.ts",
        "src/**/*.d.ts",
        "src/ui/**",
        "src/commands/menu.ts",
      ],
      all: true,
      clean: true,
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
