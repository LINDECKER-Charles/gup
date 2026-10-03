import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock execa entirely — runner.ts is a thin normalisation layer over it. Each
 * mocked call returns a fake result object with the fields runner.ts reads.
 */
const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));

vi.mock("execa", () => ({ execa: execaMock }));

import {
  commandExists,
  consumeInterrupt,
  getInstallTimeoutSeconds,
  isElevated,
  run,
  runInherit,
  setInstallTimeoutSeconds,
  skipCurrent,
  whichFirst,
} from "../../src/core/runner.js";

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

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
  setPlatform(originalPlatform);
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
    "C:\\Users\\CHARLE~1\\scoop\\shims\\gh.exe",
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
});

describe("runner install-timeout config", () => {
  afterEach(() => {
    setInstallTimeoutSeconds(1200);
  });

  it("defaults to 1200s and is settable", () => {
    expect(getInstallTimeoutSeconds()).toBe(1200);
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

describe("runner skip + interrupt channel", () => {
  afterEach(() => {
    // Tidy any flag a test left behind so the next test starts clean.
    consumeInterrupt();
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

/**
 * PATH lookup runs against a real temporary PATH: the point of the feature is
 * that it touches the filesystem instead of spawning `where` / `which`, so the
 * filesystem is what these tests exercise. Platform-specific rules run on the
 * matching CI leg only.
 */
describe("runner.whichFirst / commandExists", () => {
  const isWindows = originalPlatform === "win32";
  const binaryName = isWindows ? "tool.exe" : "tool";
  const savedPath = process.env.PATH;
  const savedPathext = process.env.PATHEXT;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "gup-which-"));
  });

  afterEach(async () => {
    process.env.PATH = savedPath;
    if (savedPathext === undefined) delete process.env.PATHEXT;
    else process.env.PATHEXT = savedPathext;
    await rm(root, { recursive: true, force: true });
  });

  /** Create `<root>/<dir>/<name>` (executable on POSIX) and return its path. */
  async function placeBinary(dir: string, name: string): Promise<string> {
    await mkdir(join(root, dir), { recursive: true });
    const file = join(root, dir, name);
    await writeFile(file, "");
    await chmod(file, 0o755);
    return file;
  }

  function usePath(...dirs: string[]): void {
    process.env.PATH = dirs.map((dir) => join(root, dir)).join(delimiter);
  }

  it("resolves in-process, without spawning where/which", async () => {
    const file = await placeBinary("bin", binaryName);
    usePath("bin");
    await expect(whichFirst("tool")).resolves.toBe(file);
    await expect(commandExists("tool")).resolves.toBe(true);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("returns the hit from the earliest PATH entry", async () => {
    await placeBinary("late", binaryName);
    const early = await placeBinary("early", binaryName);
    usePath("early", "late");
    await expect(whichFirst("tool")).resolves.toBe(early);
  });

  it("returns null when nothing on PATH matches", async () => {
    await placeBinary("bin", isWindows ? "other.exe" : "other");
    usePath("bin", "no-such-dir");
    await expect(whichFirst("tool")).resolves.toBeNull();
    await expect(commandExists("tool")).resolves.toBe(false);
  });

  it("ignores a directory that carries the command's name", async () => {
    await mkdir(join(root, "bin", binaryName), { recursive: true });
    usePath("bin");
    await expect(whichFirst("tool")).resolves.toBeNull();
  });

  it.each(["../tool", "bin/tool", "..\\tool", "to*l", ""])(
    "refuses %j, a path or a pattern rather than a command name",
    async (name) => {
      // `<root>/tool` is exactly where "../tool" would land from `<root>/bin`.
      await placeBinary(".", "tool");
      await mkdir(join(root, "bin"), { recursive: true });
      usePath("bin");
      await expect(whichFirst(name)).resolves.toBeNull();
    },
  );

  it.runIf(isWindows)("checks the bare name before PATHEXT extensions, like where", async () => {
    await placeBinary("bin", "tool.cmd");
    const bare = await placeBinary("bin", "tool");
    usePath("bin");
    process.env.PATHEXT = ".EXE;.CMD";
    await expect(whichFirst("tool")).resolves.toBe(bare);
  });

  it.runIf(isWindows)("tries PATHEXT extensions in their declared order", async () => {
    await placeBinary("bin", "tool.cmd");
    const exe = await placeBinary("bin", "tool.exe");
    usePath("bin");
    process.env.PATHEXT = ".EXE;.CMD";
    await expect(whichFirst("tool")).resolves.toBe(exe);
  });

  it.runIf(!isWindows)("skips a file without the exec bit, like which", async () => {
    const plain = await placeBinary("first", "tool");
    await chmod(plain, 0o644);
    const executable = await placeBinary("second", "tool");
    usePath("first", "second");
    await expect(whichFirst("tool")).resolves.toBe(executable);
  });

  it.runIf(!isWindows)("reports the symlink on PATH, not its target", async () => {
    const target = await placeBinary("cellar", "tool");
    await mkdir(join(root, "bin"));
    await symlink(target, join(root, "bin", "tool"));
    usePath("bin");
    await expect(whichFirst("tool")).resolves.toBe(join(root, "bin", "tool"));
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
