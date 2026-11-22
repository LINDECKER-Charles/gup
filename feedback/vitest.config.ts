import { defineConfig } from "vitest/config";

// Two projects: `unit` runs against in-memory fakes and needs nothing;
// `integration` needs a throwaway PostgreSQL (FEEDBACK_TEST_DATABASE_URL) and
// skips itself without one. Integration files share one database, so they run
// one after the other.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
