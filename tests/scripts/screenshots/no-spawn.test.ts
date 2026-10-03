import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { registeredProvider } from "../../../scripts/screenshots/fixtures/registered-provider.js";
import { SPAWN_REFUSED, spawnGuard } from "../../../scripts/screenshots/sandbox/no-spawn.js";
import { detectAvailableProviders } from "../../../src/core/registry.js";
import * as runner from "../../../src/core/runner.js";

// The generator's own guard (scripts/screenshots/setup.ts), installed the same way.
vi.mock("../../../src/core/runner.js", async (importOriginal) => {
  const { spawnGuard: guard } = await import("../../../scripts/screenshots/sandbox/no-spawn.js");
  return guard.guard(await importOriginal<typeof import("../../../src/core/runner.js")>());
});

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

  it("refuses a runner function it does not know yet, and keeps constants", () => {
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
