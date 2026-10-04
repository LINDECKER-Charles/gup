import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The runner's I/O seams: command tracing, the pipe install sink for
 * unattended runs, and detached launches. execa is mocked; each fake child
 * carries just what the runner reads from it.
 */
const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

import { setCommandTracer } from "../../src/core/process/command-tracer.js";
import { routeInheritTo, type InheritSink } from "../../src/core/process/inherit-sink.js";
import { TRUNCATED_OUTPUT_LINE } from "../../src/core/process/line-splitter.js";
import { createPipeSink, launchDetached, run, runInherit } from "../../src/core/runner.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

interface PipedChild {
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
  exit(exitCode: number): void;
}

/** A child whose streams the test writes, resolving when `exit` is called. */
function pipedChild(): PipedChild {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let resolve!: (value: unknown) => void;
  const done = new Promise((r) => {
    resolve = r;
  });
  execaMock.mockReturnValueOnce(Object.assign(done, { stdout, stderr, pid: 0 }));
  return {
    stdout,
    stderr,
    exit: (exitCode) => {
      stdout.end();
      stderr.end();
      resolve({ exitCode, failed: exitCode !== 0 });
    },
  };
}

beforeEach(() => {
  execaMock.mockReset();
});

afterEach(() => {
  setCommandTracer(null);
  restorePlatform();
});

describe("command tracing", () => {
  function recordingTracer() {
    const calls: Array<{ mode: string; command: string; args: readonly string[]; result?: unknown }> = [];
    setCommandTracer((mode, command, args) => {
      const call: (typeof calls)[number] = { mode, command, args };
      calls.push(call);
      return { end: (result) => (call.result = result) };
    });
    return calls;
  }

  it("traces a probe with its captured result", async () => {
    const calls = recordingTracer();
    execaMock.mockResolvedValueOnce({ stdout: "v1", stderr: "", exitCode: 0, failed: false });
    await run("git", ["--version"]);
    expect(calls).toEqual([
      {
        mode: "probe",
        command: "git",
        args: ["--version"],
        result: { stdout: "v1", stderr: "", exitCode: 0, failed: false },
      },
    ]);
  });

  it("traces an install on the terminal as inherit", async () => {
    const calls = recordingTracer();
    execaMock.mockResolvedValueOnce({ exitCode: 2, failed: true });
    await runInherit("npm", ["install", "-g", "x"]);
    expect(calls[0]).toMatchObject({ mode: "inherit", result: { exitCode: 2, failed: true } });
  });

  it("traces an install in a sink with the sink's mode and retained output", async () => {
    const calls = recordingTracer();
    const sink: InheritSink = {
      mode: "pty",
      start: () => ({
        exited: Promise.resolve({ exitCode: 1, failed: true, outputTail: "hash mismatch" }),
        kill: () => {},
      }),
      note: () => {},
    };
    const restore = routeInheritTo(sink);
    try {
      await runInherit("winget", ["upgrade"]);
    } finally {
      restore();
    }
    expect(calls[0]).toMatchObject({
      mode: "pty",
      command: "winget",
      result: { exitCode: 1, failed: true, stdout: "hash mismatch" },
    });
  });
});

describe("createPipeSink", () => {
  function collectingSink(capBytes = 1024) {
    const lines: Array<[string, string]> = [];
    const sink = createPipeSink({ capBytes, onLine: (line, stream) => lines.push([line, stream]) });
    return { lines, sink };
  }

  it("runs the child with the keyboard closed and its output piped, unbuffered", async () => {
    const { sink } = collectingSink();
    const child = pipedChild();
    const started = sink.start({ command: "brew", args: ["upgrade", "jq"], cwd: "/tmp" });
    child.exit(0);
    await started.exited;
    const [command, args, options] = execaMock.mock.calls[0]!;
    expect(command).toBe("brew");
    expect(args).toEqual(["upgrade", "jq"]);
    expect(options).toMatchObject({
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      buffer: false,
      reject: false,
      cwd: "/tmp",
    });
    expect(options).not.toHaveProperty("windowsHide");
  });

  it("hands every line to onLine with its stream, the last partial line included", async () => {
    const { lines, sink } = collectingSink();
    const child = pipedChild();
    const started = sink.start({ command: "brew", args: [] });
    child.stdout.write("==> Upgrading jq\n1.7");
    child.stderr.write("Warning: x\n");
    child.stdout.write(".1\n==> Done");
    child.exit(0);
    await expect(started.exited).resolves.toEqual({ exitCode: 0, failed: false });
    expect(lines).toEqual([
      ["==> Upgrading jq", "stdout"],
      ["Warning: x", "stderr"],
      ["1.7.1", "stdout"],
      ["==> Done", "stdout"],
    ]);
  });

  it("caps a chatty install with a single truncation line", async () => {
    const { lines, sink } = collectingSink(16);
    const child = pipedChild();
    const started = sink.start({ command: "brew", args: [] });
    child.stdout.write("0123456789\nabcdefghij\nmore\n");
    child.exit(0);
    await started.exited;
    expect(lines).toEqual([
      ["0123456789", "stdout"],
      [TRUNCATED_OUTPUT_LINE, "stdout"],
    ]);
  });

  it("aborts the child on kill", async () => {
    const { sink } = collectingSink();
    const child = pipedChild();
    const started = sink.start({ command: "brew", args: [] });
    started.kill();
    const { cancelSignal } = execaMock.mock.calls[0]![2] as { cancelSignal: AbortSignal };
    expect(cancelSignal.aborted).toBe(true);
    child.exit(1);
    await expect(started.exited).resolves.toMatchObject({ failed: true });
  });

  it("reports a spawn that throws as an exited, failed process", async () => {
    execaMock.mockImplementationOnce(() => {
      throw new Error("EINVAL");
    });
    const { sink } = collectingSink();
    await expect(sink.start({ command: "x", args: [] }).exited).resolves.toEqual({
      exitCode: -1,
      failed: true,
    });
  });

  it("writes gup's own notes as stdout lines", () => {
    const { lines, sink } = collectingSink();
    sink.note("historique non écrit");
    expect(lines).toEqual([["historique non écrit", "stdout"]]);
    expect(sink.mode).toBe("pipe");
  });
});

describe("launchDetached", () => {
  function detachedChild(outcome: "spawn" | "error") {
    const nodeChildProcess = Object.assign(new EventEmitter(), { unref: vi.fn() });
    const settled = new Promise((resolve) => {
      setImmediate(() => {
        if (outcome === "spawn") nodeChildProcess.emit("spawn");
        resolve({ exitCode: outcome === "spawn" ? 0 : -2, failed: outcome !== "spawn" });
      });
    });
    execaMock.mockReturnValueOnce(Object.assign(settled, { nodeChildProcess }));
    return { unref: nodeChildProcess.unref };
  }

  it("starts the process detached, ignored and outliving gup, then lets it go", async () => {
    setPlatform("win32");
    const { unref } = detachedChild("spawn");
    await expect(launchDetached("explorer.exe", ["C:\\r.html"])).resolves.toBe(true);
    const [command, args, options] = execaMock.mock.calls[0]!;
    expect([command, args]).toEqual(["explorer.exe", ["C:\\r.html"]]);
    expect(options).toMatchObject({
      detached: true,
      cleanup: false,
      stdio: "ignore",
      reject: false,
      windowsHide: false,
    });
    expect(unref).toHaveBeenCalled();
  });

  it("resolves false when the process never spawned", async () => {
    detachedChild("error");
    await expect(launchDetached("xdg-open", ["/tmp/r.html"])).resolves.toBe(false);
  });

  it("refuses an unsafe command name before spawning", async () => {
    await expect(launchDetached("open;rm")).rejects.toThrow(/runner:/);
    expect(execaMock).not.toHaveBeenCalled();
  });
});
