import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    clearMocks: true,
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
        lines: 99,
        functions: 100,
        branches: 95,
        statements: 99,
      },
    },
  },
});
