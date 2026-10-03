import { matchesGlob, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configDefaults, type TestProjectConfiguration } from "vitest/config";

/**
 * Every test file must run in exactly one vitest project: a file matched by
 * none silently never runs, and a file matched by two runs twice under two
 * different setups (the providers project fakes the whole machine).
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

interface ProjectRoute {
  readonly name: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

function toRoute(entry: TestProjectConfiguration): ProjectRoute {
  if (typeof entry !== "object" || !("test" in entry) || !entry.test?.name) {
    throw new Error("the membership check only understands named inline projects");
  }
  const { name, include = [], exclude = configDefaults.exclude } = entry.test;
  return { name: typeof name === "string" ? name : name.label, include, exclude };
}

async function loadRoutes(e2e: "on" | "off"): Promise<readonly ProjectRoute[]> {
  vi.stubEnv("GUP_E2E", e2e === "on" ? "1" : undefined);
  vi.resetModules();
  const { default: config } = await import("../../../vitest.config.js");
  return (config.test?.projects ?? []).map(toRoute);
}

/**
 * Every file vitest would take for a test by default, not only the projects'
 * `*.test.ts`: a `.spec.ts` or `.test.tsx` file matches no project and would
 * silently never run.
 */
async function listTestFiles(): Promise<readonly string[]> {
  // The real fs: in the providers project, node:fs is the fake machine's.
  const { globSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
  const patterns = configDefaults.include.map((pattern) => `tests/${pattern}`);
  const files = globSync(patterns, { cwd: REPO_ROOT });
  return files.map((file) => file.split(sep).join("/"));
}

function projectsOf(file: string, routes: readonly ProjectRoute[]): readonly string[] {
  return routes
    .filter((route) => route.include.some((pattern) => matchesGlob(file, pattern)))
    .filter((route) => !route.exclude.some((pattern) => matchesGlob(file, pattern)))
    .map((route) => route.name);
}

function misrouted(
  files: readonly string[],
  routes: readonly ProjectRoute[],
): Readonly<Record<string, readonly string[]>> {
  const entries = files
    .map((file) => [file, projectsOf(file, routes)] as const)
    .filter(([, projects]) => projects.length !== 1);
  return Object.fromEntries(entries);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vitest project membership", () => {
  it("puts every test file in exactly one project when the e2e suites are enabled", async () => {
    const files = await listTestFiles();

    expect(files.length).toBeGreaterThan(0);
    expect(misrouted(files, await loadRoutes("on"))).toEqual({});
  });

  it("leaves only the end-to-end suites out when GUP_E2E is unset", async () => {
    const routes = await loadRoutes("off");
    const files = (await listTestFiles()).filter((file) => !file.endsWith(".e2e.test.ts"));

    expect(routes.map((route) => route.name)).not.toContain("e2e");
    expect(misrouted(files, routes)).toEqual({});
  });

  // The paths the wave-2 branches are planned to add: each lands in the
  // project whose setup it needs.
  it.each([
    ["tests/core/config/store.test.ts", "unit"],
    ["tests/commands/schedule/schedule-command.test.ts", "unit"],
    ["tests/ui/views/journal-view.test.ts", "unit"],
    ["tests/security/scheduler-injection.test.ts", "unit"],
    ["tests/scripts/screenshots/scenes.test.ts", "unit"],
    ["tests/cli/startup.test.ts", "unit"],
    ["tests/providers/winget.test.ts", "providers-legacy"],
    ["tests/providers/iac/contract.test.ts", "providers"],
    ["tests/platform/platform-simulation.test.ts", "providers"],
    ["tests/support/self-test/fake-runner.test.ts", "providers"],
    ["tests/integration/pty-runner.test.ts", "integration"],
    ["tests/e2e/cli-smoke.e2e.test.ts", "e2e"],
  ])("routes %s to the %s project", async (file, expected) => {
    expect(projectsOf(file, await loadRoutes("on"))).toEqual([expected]);
  });
});
