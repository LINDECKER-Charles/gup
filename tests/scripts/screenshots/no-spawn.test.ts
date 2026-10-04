import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { registeredProvider } from "../../../scripts/screenshots/fixtures/registered-provider.js";
import { SPAWN_REFUSED, spawnGuard } from "../../../scripts/screenshots/sandbox/no-spawn.js";
import * as opener from "../../../src/core/export/open-external.js";
import * as ptyLoader from "../../../src/core/pty/pty-loader.js";
import { detectAvailableProviders } from "../../../src/core/registry.js";
import * as runner from "../../../src/core/runner.js";
import * as triggerFactory from "../../../src/core/scheduler/trigger/trigger-factory.js";

// The generator's own guards (scripts/screenshots/setup.ts), installed the same way.
vi.mock("../../../src/core/runner.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(load, "runner"),
);
vi.mock("../../../src/core/pty/pty-loader.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(
    load,
    "ptyLoader",
  ),
);
vi.mock("../../../src/core/export/open-external.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(load, "opener"),
);
vi.mock("../../../src/core/scheduler/trigger/trigger-factory.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(
    load,
    "osTrigger",
  ),
);

afterEach(() => {
  spawnGuard.reset();
});

describe("the screenshots' spawn guard", () => {
  it("refuses every way the runner starts a process, and records each call", () => {
    const calls: ReadonlyArray<() => unknown> = [
      () => runner.run("git", ["--version"]),
      () => runner.runInherit("npm", ["install", "-g", "pnpm"]),
      () => runner.launchDetached("explorer.exe", ["report.html"]),
      () => runner.killProcessTree(4242),
      () => runner.commandExists("winget"),
      () => runner.whichFirst("node"),
      () => runner.isElevated(),
      () => runner.createPipeSink({ onLine: () => {}, capBytes: 1024 }),
    ];
    for (const call of calls) expect(call).toThrow(SPAWN_REFUSED);
    expect(spawnGuard.attempts).toEqual([
      "run git --version",
      "runInherit npm install -g",
      "launchDetached explorer.exe report.html",
      "killProcessTree",
      "commandExists winget",
      "whichFirst node",
      "isElevated",
      "createPipeSink",
    ]);
  });

  it("keeps the runner's process-free helpers real", () => {
    onTestFinished(() => runner.setInstallTimeoutSeconds(runner.DEFAULT_INSTALL_TIMEOUT_S));
    runner.setInstallTimeoutSeconds(90);
    expect(runner.getInstallTimeoutSeconds()).toBe(90);
    expect(runner.normalizeExitCode(4294967295, "win32")).toBe(-1);
    expect(runner.consumeInterrupt()).toEqual({ timedOut: false, aborted: false });
    expect(runner.skipCurrent()).toBe(false);
    expect(spawnGuard.attempts).toEqual([]);
  });

  it("refuses node-pty's loader, the report's opener and the OS trigger factory", () => {
    const calls: ReadonlyArray<() => unknown> = [
      () => ptyLoader.loadEmbeddedTerminal(),
      () => ptyLoader.detectEmbeddedTerminal(),
      () => opener.openExternal("C:\\rapports\\gup-report.html"),
      () =>
        triggerFactory.osTriggerFor({
          platform: "win32",
          env: {},
          home: "C:\\Users\\dev",
          uid: undefined,
          agentStderr: "agent-stderr.log",
        }),
    ];
    for (const call of calls) expect(call).toThrow(SPAWN_REFUSED);
    expect(spawnGuard.attempts).toEqual([
      "loadEmbeddedTerminal",
      "detectEmbeddedTerminal",
      "openExternal C:\\rapports\\gup-report.html",
      "osTriggerFor",
    ]);
  });

  it("keeps the pure helpers of those modules real", () => {
    const facts: opener.OpenerFacts = {
      platform: "darwin",
      env: {},
      launchers: { xdgOpen: null, wslview: null },
    };
    expect(opener.openerFor("/tmp/report.html", facts)).toEqual({
      command: "/usr/bin/open",
      args: ["/tmp/report.html"],
    });
    expect(triggerFactory.systemRootOf({ SystemRoot: "D:\\Windows" })).toBe("D:\\Windows");
    expect(ptyLoader.NODE_PTY_PIN).toMatch(/^\d+\.\d+\.\d+$/);
    expect(spawnGuard.attempts).toEqual([]);
  });

  it("refuses a function it does not know yet, and keeps constants", () => {
    const guarded = spawnGuard.guard({ startSomethingNew: () => "started", LIMIT: 3 });
    expect(() => guarded.startSomethingNew()).toThrow(SPAWN_REFUSED);
    expect(guarded.LIMIT).toBe(3);
    expect(spawnGuard.attempts).toEqual(["startSomethingNew"]);
  });

  it("keeps the record of a refusal the app swallowed", async () => {
    // Detection is fail-soft: the refused probe only reads as "not installed"…
    await expect(detectAvailableProviders([registeredProvider("npm-g")])).resolves.toEqual([]);
    // …so the record is what fails the scene that reached the real machine.
    expect(spawnGuard.attempts).toEqual(["commandExists npm"]);
  });
});
