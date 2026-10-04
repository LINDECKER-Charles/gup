import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock execa entirely — runner.ts is a thin normalisation layer over it. Each
 * mocked call returns a fake result object with the fields runner.ts reads.
 */
const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));

vi.mock("execa", () => ({ execa: execaMock }));

import {
  routeInheritTo,
  type InheritExit,
  type InheritProcess,
  type InheritSink,
} from "../../src/core/process/inherit-sink.js";
import {
  consumeInterrupt,
  createPipeSink,
  DEFAULT_INSTALL_TIMEOUT_S,
  getInstallTimeoutSeconds,
  isElevated,
  killProcessTree,
  normalizeExitCode,
  run,
  runInherit,
  setInstallTimeoutSeconds,
  skipCurrent,
} from "../../src/core/runner.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

function mkExecaResult(over: Partial<{
  stdout: unknown;
  stderr: unknown;
  exitCode: unknown;
  failed: boolean;
}> = {}) {
  return Promise.resolve({
    stdout: "stdout-default",
    stderr: "stderr-default",
    exitCode: 0,
    failed: false,
    ...over,
  });
}

beforeEach(() => {
  execaMock.mockReset();
});

afterEach(() => {
  restorePlatform();
});

describe("runner.run", () => {
  it("returns normalised stdout/stderr/exitCode and not-failed for a clean exit", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ stdout: "ok", stderr: "", exitCode: 0 }));
    const res = await run("echo", ["hi"]);
    expect(res).toEqual({ stdout: "ok", stderr: "", exitCode: 0, failed: false });
    expect(execaMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = execaMock.mock.calls[0]!;
    expect(cmd).toBe("echo");
    expect(args).toEqual(["hi"]);
    expect(opts).toMatchObject({
      reject: false,
      encoding: "utf8",
      stripFinalNewline: true,
      windowsHide: true,
    });
  });

  it("flags failed=true when exitCode != 0 even if execa.failed is false", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ stdout: "", stderr: "boom", exitCode: 2, failed: false }));
    const res = await run("foo");
    expect(res.failed).toBe(true);
    expect(res.exitCode).toBe(2);
  });

  it("flags failed=true when execa.failed is true even with exitCode 0", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0, failed: true }));
    const res = await run("foo");
    expect(res.failed).toBe(true);
  });

  it("falls back to exitCode=-1 when the value is not a number", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: null, failed: true }));
    const res = await run("foo");
    expect(res.exitCode).toBe(-1);
    expect(res.failed).toBe(true);
  });

  it("coerces nullish stdout/stderr to empty strings", async () => {
    execaMock.mockReturnValueOnce(
      mkExecaResult({ stdout: undefined, stderr: undefined, exitCode: 0 }),
    );
    const res = await run("foo");
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe("");
  });

  it("merges caller options over the defaults (caller wins)", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await run("foo", [], { encoding: "buffer", env: { X: "1" }, timeout: 5000 });
    const [, , opts] = execaMock.mock.calls[0]!;
    expect(opts).toMatchObject({ encoding: "buffer", env: { X: "1" }, timeout: 5000 });
  });

  it("closes the child's stdin, unless the caller feeds it", async () => {
    execaMock.mockReturnValue(mkExecaResult({ exitCode: 0 }));
    await run("foo");
    await run("foo", [], { input: "y\n" });
    expect(execaMock.mock.calls[0]![2]).toMatchObject({ stdin: "ignore" });
    expect(execaMock.mock.calls[1]![2]).not.toHaveProperty("stdin");
  });

  it("caps every run and kills the whole process tree when the cap hits", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await run("foo");
    const [, , opts] = execaMock.mock.calls[0]!;
    expect(opts).toMatchObject({ killDescendants: true });
    expect((opts as { timeout?: number }).timeout).toBeGreaterThan(0);
  });

  it("reports a run that hit the cap as failed and timedOut", async () => {
    execaMock.mockReturnValueOnce(
      Promise.resolve({ stdout: "", stderr: "", exitCode: undefined, failed: true, timedOut: true }),
    );
    await expect(run("foo")).resolves.toMatchObject({ failed: true, timedOut: true });
  });

  it.each([
    "npm",
    "winget",
    "scoop",
    "Rscript",
    "node.exe",
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Program Files (x86)\\Tool\\foo.exe",
    // 8.3 short paths. Windows hands these back for any directory name over 8
    // characters or containing a space, so they turn up in PATH entries and in
    // %TEMP% on every machine whose username is longer than 8 characters —
    // refusing them made gup unable to spawn ordinary binaries.
    "C:\\PROGRA~1\\nodejs\\npm.cmd",
    "C:\\Users\\JANEDO~1\\scoop\\shims\\gh.exe",
    "/usr/local/bin/foo",
    "python3.13",
  ])("accepts safe command name %j", async (cmd) => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await expect(run(cmd)).resolves.toMatchObject({ failed: false });
  });

  it.each([
    "echo hi; rm -rf /",
    "foo|bar",
    "foo&bar",
    "foo$VAR",
    "foo`bar`",
    "foo>out",
    "foo\nbar",
    "foo'bar",
    'foo"bar',
    "",
  ])("rejects unsafe command name %j without invoking execa", async (cmd) => {
    await expect(run(cmd)).rejects.toThrow(/runner:/);
    expect(execaMock).not.toHaveBeenCalled();
  });
});

describe("runner.runInherit", () => {
  it("returns empty stdout/stderr and the normalised exitCode", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    const res = await runInherit("foo", ["bar"]);
    expect(res).toEqual({ stdout: "", stderr: "", exitCode: 0, failed: false });
    const [, , opts] = execaMock.mock.calls[0]!;
    // Inherit path streams to the terminal and must NOT hide windows: an
    // installer that falls back to GUI has to be visible, not block on an
    // invisible window. It also wires a cancelSignal for the manual skip lever.
    expect(opts).toMatchObject({ reject: false, stdio: "inherit" });
    expect(opts).not.toHaveProperty("windowsHide");
    expect((opts as { cancelSignal?: unknown }).cancelSignal).toBeInstanceOf(AbortSignal);
  });

  it("flags failed=true when execa reports a non-zero exit", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 1, failed: true }));
    const res = await runInherit("foo");
    expect(res.failed).toBe(true);
    expect(res.exitCode).toBe(1);
  });

  it("falls back to -1 when exitCode is missing", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: undefined, failed: true }));
    const res = await runInherit("foo");
    expect(res.exitCode).toBe(-1);
  });

  it("rejects unsafe command name without invoking execa", async () => {
    await expect(runInherit("foo;bar")).rejects.toThrow(/runner:/);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("forwards the working directory and the shell routing, nothing else", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await runInherit("scoop", ["update", "x"], { cwd: "C:\\tmp", shell: true, timeout: 0 });
    const [, , opts] = execaMock.mock.calls[0]!;
    expect(opts).toMatchObject({ cwd: "C:\\tmp", shell: true });
    expect(opts).not.toHaveProperty("timeout");
  });

  it("reports a failed exit when the spawn itself throws", async () => {
    execaMock.mockImplementationOnce(() => {
      throw new Error("spawn EINVAL");
    });
    await expect(runInherit("foo")).resolves.toMatchObject({ exitCode: -1, failed: true });
  });
});

describe("runner.runInherit with an install sink", () => {
  interface FakeChild {
    readonly process: InheritProcess;
    readonly kill: ReturnType<typeof vi.fn>;
    exit(result: InheritExit): void;
  }

  function fakeChild(): FakeChild {
    let resolveExit!: (exit: InheritExit) => void;
    const exited = new Promise<InheritExit>((resolve) => {
      resolveExit = resolve;
    });
    const kill = vi.fn();
    return { process: { exited, kill }, kill, exit: (result) => resolveExit(result) };
  }

  function sinkStarting(child: FakeChild): InheritSink & { start: ReturnType<typeof vi.fn> } {
    return { mode: "pty", start: vi.fn(() => child.process), note: vi.fn() };
  }

  let restore: () => void = () => {};
  afterEach(() => {
    restore();
    consumeInterrupt();
    setInstallTimeoutSeconds(1200);
  });

  it("hands the sanitised request to the sink and never spawns through execa", async () => {
    const child = fakeChild();
    const sink = sinkStarting(child);
    restore = routeInheritTo(sink);
    const pending = runInherit("winget", ["upgrade", "--id", "Git.Git"], { cwd: "C:\\x" });
    child.exit({ exitCode: 0, failed: false });
    await expect(pending).resolves.toEqual({ stdout: "", stderr: "", exitCode: 0, failed: false });
    expect(sink.start).toHaveBeenCalledWith({
      command: "winget",
      args: ["upgrade", "--id", "Git.Git"],
      cwd: "C:\\x",
    });
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("refuses an unsafe command before the sink sees it", async () => {
    const sink = sinkStarting(fakeChild());
    restore = routeInheritTo(sink);
    await expect(runInherit("a&b")).rejects.toThrow(/runner:/);
    expect(sink.start).not.toHaveBeenCalled();
  });

  it("kills the sink's process on skipCurrent and flags the result aborted", async () => {
    const child = fakeChild();
    restore = routeInheritTo(sinkStarting(child));
    const pending = runInherit("winget", ["upgrade"]);
    expect(skipCurrent()).toBe(true);
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.exit({ exitCode: 1, failed: true });
    await expect(pending).resolves.toMatchObject({ aborted: true, failed: true });
    expect(consumeInterrupt().aborted).toBe(true);
  });

  it("kills the sink's process when the install timeout fires", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      restore = routeInheritTo(sinkStarting(child));
      setInstallTimeoutSeconds(1);
      const pending = runInherit("winget", ["upgrade"]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      child.exit({ exitCode: -1, failed: true });
      await expect(pending).resolves.toMatchObject({ timedOut: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("normalises the sink's exit code like the terminal path's", async () => {
    setPlatform("win32");
    const child = fakeChild();
    restore = routeInheritTo(sinkStarting(child));
    const pending = runInherit("vs_installer.exe");
    child.exit({ exitCode: 3221225786, failed: true });
    await expect(pending).resolves.toMatchObject({ exitCode: -1073741510 });
  });

  it("spawns through execa again once the route is restored", async () => {
    restore = routeInheritTo(sinkStarting(fakeChild()));
    restore();
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await runInherit("foo");
    expect(execaMock).toHaveBeenCalledTimes(1);
  });
});

describe("runner.killProcessTree", () => {
  it("runs taskkill on the whole tree on Windows, capped in time", async () => {
    setPlatform("win32");
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await killProcessTree(4242);
    expect(execaMock).toHaveBeenCalledWith("taskkill", ["/pid", "4242", "/t", "/f"], {
      reject: false,
      windowsHide: true,
      timeout: 10_000,
    });
  });

  it("never rejects, whatever taskkill does", async () => {
    setPlatform("win32");
    execaMock.mockReturnValueOnce(Promise.reject(new Error("spawn taskkill ENOENT")));
    await expect(killProcessTree(4242)).resolves.toBeUndefined();
    execaMock.mockImplementationOnce(() => {
      throw new TypeError("bad options");
    });
    await expect(killProcessTree(4242)).resolves.toBeUndefined();
  });

  it("does nothing off Windows or without a pid", async () => {
    setPlatform("linux");
    await killProcessTree(4242);
    setPlatform("win32");
    await killProcessTree(undefined);
    expect(execaMock).not.toHaveBeenCalled();
  });
});

describe("runner exit codes", () => {
  it("reads Windows exit codes as signed 32-bit integers", () => {
    expect(normalizeExitCode(4294967295, "win32")).toBe(-1);
    expect(normalizeExitCode(3221225786, "win32")).toBe(-1073741510);
    expect(normalizeExitCode(2316632107, "win32")).toBe(-1978335189);
    expect(normalizeExitCode(3010, "win32")).toBe(3010);
    expect(normalizeExitCode(-1, "win32")).toBe(-1);
  });

  it("leaves POSIX exit statuses untouched", () => {
    expect(normalizeExitCode(130, "linux")).toBe(130);
    expect(normalizeExitCode(255, "darwin")).toBe(255);
  });

  it("reports the signed code from both spawn paths on Windows", async () => {
    setPlatform("win32");
    // Visual Studio's "cancelled", as execa reports it.
    execaMock.mockReturnValue(mkExecaResult({ exitCode: 3221225786, failed: true }));
    await expect(runInherit("vs_installer.exe")).resolves.toMatchObject({
      exitCode: -1073741510,
      failed: true,
    });
    await expect(run("vs_installer.exe")).resolves.toMatchObject({
      exitCode: -1073741510,
      failed: true,
    });
  });
});

describe("runner install-timeout config", () => {
  afterEach(() => {
    setInstallTimeoutSeconds(1200);
  });

  it("defaults to 1200s and is settable", () => {
    expect(getInstallTimeoutSeconds()).toBe(1200);
    expect(DEFAULT_INSTALL_TIMEOUT_S).toBe(1200);
    setInstallTimeoutSeconds(30);
    expect(getInstallTimeoutSeconds()).toBe(30);
  });

  it("floors fractional seconds and clamps invalid/negative to 0", () => {
    setInstallTimeoutSeconds(12.9);
    expect(getInstallTimeoutSeconds()).toBe(12);
    setInstallTimeoutSeconds(-5);
    expect(getInstallTimeoutSeconds()).toBe(0);
    setInstallTimeoutSeconds(Number.NaN);
    expect(getInstallTimeoutSeconds()).toBe(0);
  });
});

const PENDING = Symbol("pending");

/** The value of a promise if it already settled, else PENDING. */
async function peek<T>(promise: Promise<T>): Promise<T | typeof PENDING> {
  const later = new Promise<typeof PENDING>((resolve) => setImmediate(() => resolve(PENDING)));
  return Promise.race([promise, later]);
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

describe("runner skip + interrupt channel", () => {
  let restoreSink: (() => void) | null = null;

  afterEach(() => {
    // Tidy any flag a test left behind so the next test starts clean.
    consumeInterrupt();
    restoreSink?.();
    restoreSink = null;
  });

  it("skipCurrent returns false when no install is in flight", () => {
    expect(skipCurrent()).toBe(false);
  });

  it("consumeInterrupt returns cleared flags by default", () => {
    expect(consumeInterrupt()).toEqual({ timedOut: false, aborted: false });
  });

  it("skipCurrent aborts the in-flight runInherit and surfaces aborted", async () => {
    let resolveProc!: (v: unknown) => void;
    const deferred = new Promise((r) => {
      resolveProc = r;
    });
    execaMock.mockReturnValueOnce(deferred);

    // runInherit runs synchronously up to `await proc`, so by the time this
    // returns the abort hook is registered.
    const pending = runInherit("winget", ["upgrade", "--id", "x"]);
    expect(skipCurrent()).toBe(true);
    resolveProc({ exitCode: 1, failed: true });

    const res = await pending;
    expect(res.aborted).toBe(true);
    expect(res.failed).toBe(true);

    const flags = consumeInterrupt();
    expect(flags.aborted).toBe(true);
    expect(consumeInterrupt().aborted).toBe(false); // consumed → reset
  });

  // The direct child dies first — cmd.exe behind npm.cmd, which execa's abort
  // kills — while the installer under it waits on taskkill. A provider repairs
  // what an interrupted installer left (npm-g's staged copy): the outcome must
  // not come back before nothing of the tree is left to race that repair.
  it.each([
    ["the terminal", (): void => {}],
    [
      "a pipe sink",
      (): void => {
        restoreSink = routeInheritTo(createPipeSink({ onLine: () => {}, capBytes: 1024 }));
      },
    ],
  ])("reports a stopped install on %s once taskkill took its tree (Windows)", async (_, route) => {
    setPlatform("win32");
    route();
    const install = deferred<unknown>();
    const taskkill = deferred<unknown>();
    execaMock
      .mockReturnValueOnce(Object.assign(install.promise, { pid: 4242 }))
      .mockReturnValueOnce(taskkill.promise);

    const pending = runInherit("npm", ["install", "-g", "x@latest"]);
    expect(skipCurrent()).toBe(true);
    install.resolve({ exitCode: 1, failed: true });
    expect(await peek(pending)).toBe(PENDING);

    taskkill.resolve({ exitCode: 0 });
    await expect(pending).resolves.toMatchObject({ aborted: true, failed: true });
    expect(execaMock.mock.calls[1]?.[0]).toBe("taskkill");
  });

  it("clears the abort hook after completion (no stale skip target)", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await runInherit("foo");
    expect(skipCurrent()).toBe(false);
  });

  it("a caller-supplied options.timeout overrides the global default", async () => {
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    const res = await runInherit("foo", [], { timeout: 5000 });
    expect(res.failed).toBe(false);
    // cancelSignal is still wired regardless of which timeout source wins.
    const [, , opts] = execaMock.mock.calls[0]!;
    expect((opts as { cancelSignal?: unknown }).cancelSignal).toBeInstanceOf(AbortSignal);
  });

  it("does not arm a timer when the timeout is disabled (0)", async () => {
    setInstallTimeoutSeconds(0);
    try {
      execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
      const res = await runInherit("foo");
      expect(res).toEqual({ stdout: "", stderr: "", exitCode: 0, failed: false });
    } finally {
      setInstallTimeoutSeconds(1200);
    }
  });
});

describe("runner.isElevated", () => {
  const originalGetuid = process.getuid;
  const setGetuid = (getuid: (() => number) | undefined): void => {
    Object.defineProperty(process, "getuid", { value: getuid, configurable: true, writable: true });
  };
  afterEach(() => setGetuid(originalGetuid));

  it("reports root as elevated on POSIX, without probing", async () => {
    setPlatform("linux");
    setGetuid(() => 0);
    await expect(isElevated()).resolves.toBe(true);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("reports a regular POSIX user as not elevated", async () => {
    setPlatform("darwin");
    setGetuid(() => 501);
    await expect(isElevated()).resolves.toBe(false);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("reports not elevated when the platform has no uid to check", async () => {
    setPlatform("linux");
    setGetuid(undefined);
    await expect(isElevated()).resolves.toBe(false);
  });

  it("returns true on win32 when `net session` succeeds", async () => {
    setPlatform("win32");
    execaMock.mockReturnValueOnce(mkExecaResult({ exitCode: 0 }));
    await expect(isElevated()).resolves.toBe(true);
    const [cmd, args] = execaMock.mock.calls[0]!;
    expect(cmd).toBe("net");
    expect(args).toEqual(["session"]);
  });

  it("returns false on win32 when `net session` fails (non-admin)", async () => {
    setPlatform("win32");
    execaMock.mockReturnValueOnce(
      mkExecaResult({ exitCode: 5, failed: true }),
    );
    await expect(isElevated()).resolves.toBe(false);
  });
});
