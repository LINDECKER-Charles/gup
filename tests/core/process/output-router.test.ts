import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InheritSink } from "../../../src/core/process/inherit-sink.js";

/**
 * The router keeps process-wide state (the full-screen flag, the deferred
 * queue, its exit hook): each test loads a fresh copy of the module.
 */
async function loadRouter() {
  vi.resetModules();
  const sinks = await import("../../../src/core/process/inherit-sink.js");
  const router = await import("../../../src/core/process/output-router.js");
  return { ...sinks, ...router };
}

let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;
let exitHooks: Array<() => void>;

beforeEach(() => {
  stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  exitHooks = [];
  // Capture the exit hook instead of registering it on the test worker.
  vi.spyOn(process, "once").mockImplementation(((event: string, hook: () => void) => {
    if (event === "exit") exitHooks.push(hook);
    return process;
  }) as typeof process.once);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function noteSink(): InheritSink & { notes: string[] } {
  const notes: string[] = [];
  return {
    mode: "pty",
    notes,
    start: () => ({ exited: Promise.resolve({ exitCode: 0, failed: false }), kill: () => {} }),
    note: (line) => notes.push(line),
  };
}

const written = (spy: { mock: { calls: unknown[][] } }): string =>
  spy.mock.calls.map((call) => String(call[0])).join("");

describe("installConsole", () => {
  it("writes info lines on stdout and warnings on stderr when nothing else is up", async () => {
    const { installConsole } = await loadRouter();
    installConsole.log("  ↓ https://example.test/a.zip");
    installConsole.warn("  historique non écrit — EACCES");
    expect(written(stdout)).toBe("  ↓ https://example.test/a.zip\n");
    expect(written(stderr)).toContain("  historique non écrit — EACCES");
    expect(written(stderr).endsWith("\n")).toBe(true);
  });

  it("sends both kinds of line into the active install sink", async () => {
    const { installConsole, routeInheritTo } = await loadRouter();
    const sink = noteSink();
    const restore = routeInheritTo(sink);
    try {
      installConsole.log("info");
      installConsole.warn("warning");
    } finally {
      restore();
    }
    expect(sink.notes).toEqual(["info", "warning"]);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("holds lines back while a full screen is mounted and prints them at exit", async () => {
    const { installConsole, setFullScreen } = await loadRouter();
    setFullScreen(true);
    installConsole.warn("first");
    installConsole.log("second");
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(exitHooks).toHaveLength(1);

    exitHooks[0]!();
    const out = written(stderr);
    expect(out).toContain("first");
    expect(out.indexOf("first")).toBeLessThan(out.indexOf("second"));
  });

  it("writes directly again once the screen is gone", async () => {
    const { installConsole, setFullScreen } = await loadRouter();
    setFullScreen(true);
    setFullScreen(false);
    installConsole.log("visible");
    expect(written(stdout)).toBe("visible\n");
  });

  it("prefers the sink over deferral when a screen hosts the installs", async () => {
    const { installConsole, routeInheritTo, setFullScreen } = await loadRouter();
    setFullScreen(true);
    const sink = noteSink();
    const restore = routeInheritTo(sink);
    installConsole.warn("in the pane");
    restore();
    expect(sink.notes).toEqual(["in the pane"]);
    expect(exitHooks).toHaveLength(0);
  });
});

describe("deferUntilExit", () => {
  it("registers a single exit hook however many lines are queued", async () => {
    const { deferUntilExit } = await loadRouter();
    deferUntilExit("a");
    deferUntilExit("b");
    expect(exitHooks).toHaveLength(1);
    exitHooks[0]!();
    expect(stderr).toHaveBeenCalledTimes(2);
  });
});
