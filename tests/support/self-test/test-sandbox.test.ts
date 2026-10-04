import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sandboxTeardown } from "../sandbox-teardown.js";
import {
  isDroppedFromShell,
  SANDBOX_DIR_VARS,
  SANDBOX_ROOT_VAR,
  sandboxRoot,
  sharedTestEnv,
  workerSandbox,
  workerSandboxEnv,
} from "../test-env.js";

describe("shared test env", () => {
  it("turns every persistent writer off and pins the time zone", () => {
    expect(sharedTestEnv("/sandbox")).toMatchObject({
      GUP_HISTORY: "0",
      GUP_CONFIG: "0",
      GUP_LOG_LEVEL: "off",
      TZ: "UTC",
    });
  });

  it("points every directory override under the run's sandbox root", () => {
    const env = sharedTestEnv(join("/tmp", "gup-vitest-42"));

    expect(env[SANDBOX_ROOT_VAR]).toBe(join("/tmp", "gup-vitest-42"));
    for (const [variable, dir] of Object.entries(SANDBOX_DIR_VARS)) {
      expect(env[variable]).toBe(join("/tmp", "gup-vitest-42", dir));
    }
  });

  it("gives each run its own root and each worker its own directory inside it", () => {
    const root = sandboxRoot("/tmp", 42);

    expect(root).not.toBe(sandboxRoot("/tmp", 43));
    expect(workerSandbox(root, "1")).not.toBe(workerSandbox(root, "2"));
    expect(workerSandboxEnv(root, "3").GUP_LOG_DIR).toBe(join(root, "w3", "logs"));
  });
});

describe("variables inherited from the developer's shell", () => {
  const dropped = ["NO_COLOR", "FORCE_COLOR", "GUP_ASCII", "GUP_PTY", "gup_install_timeout"];
  const kept = ["GUP_HISTORY", "GUP_LOG_DIR", SANDBOX_ROOT_VAR, "GUP_E2E", "GUP_MUTATE", "PATH"];

  it.each(dropped)("drops %s", (name) => {
    expect(isDroppedFromShell(name)).toBe(true);
  });

  it.each(kept)("keeps %s", (name) => {
    expect(isDroppedFromShell(name)).toBe(false);
  });
});

describe("worker setup", () => {
  it("left none of the shell's gup or colour switches in this worker", () => {
    expect(Object.keys(process.env).filter(isDroppedFromShell)).toEqual([]);
  });

  it("moved this worker's directory overrides into its own sandbox", () => {
    const root = process.env[SANDBOX_ROOT_VAR] ?? "";
    const own = workerSandboxEnv(root, process.env["VITEST_POOL_ID"] ?? "0");

    expect(root).not.toBe("");
    expect(process.env["GUP_LOG_DIR"]).toBe(own.GUP_LOG_DIR);
    expect(process.env["GUP_REPORT_DIR"]).toBe(own.GUP_REPORT_DIR);
    expect(process.env["GUP_SCHEDULER_DIR"]).toBe(own.GUP_SCHEDULER_DIR);
  });
});

describe("sandbox teardown", () => {
  it("removes the run's root with every worker sandbox inside", async () => {
    const root = await mkdtemp(join(tmpdir(), "gup-teardown-"));
    await mkdir(join(root, "w1", "logs"), { recursive: true });
    await writeFile(join(root, "w1", "logs", "gup.log"), "stray write");

    await sandboxTeardown(root)();

    expect(existsSync(root)).toBe(false);
  });

  it("tolerates a run that never created its sandbox", async () => {
    const parent = await mkdtemp(join(tmpdir(), "gup-teardown-"));

    await expect(sandboxTeardown(join(parent, "never-created"))()).resolves.toBeUndefined();
    await sandboxTeardown(parent)();
  });
});
