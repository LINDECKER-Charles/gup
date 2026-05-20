import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock execa entirely — runner.ts is a thin normalisation layer over it. Each
 * mocked call returns a fake result object with the fields runner.ts reads.
 */
const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));

vi.mock("execa", () => ({ execa: execaMock }));

import {
  commandExists,
  isElevated,
  run,
  runInherit,
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
    await run("foo", [], { encoding: "buffer", env: { X: "1" } });
    const [, , opts] = execaMock.mock.calls[0]!;
    expect(opts).toMatchObject({ encoding: "buffer", env: { X: "1" } });
  });

  it.each([
    "npm",
    "winget",
    "scoop",
    "Rscript",
    "node.exe",
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Program Files (x86)\\Tool\\foo.exe",
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
    expect(opts).toMatchObject({ reject: false, stdio: "inherit", windowsHide: true });
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

describe("runner.commandExists", () => {
  it("uses `where` on win32 and returns true when stdout is non-empty", async () => {
    setPlatform("win32");
    execaMock.mockReturnValueOnce(
      mkExecaResult({ stdout: "C:\\Tools\\foo.exe", exitCode: 0 }),
    );
    await expect(commandExists("foo")).resolves.toBe(true);
    const [cmd, args] = execaMock.mock.calls[0]!;
    expect(cmd).toBe("where");
    expect(args).toEqual(["foo"]);
  });

  it("uses `which` on linux and returns true on success", async () => {
    setPlatform("linux");
    execaMock.mockReturnValueOnce(
      mkExecaResult({ stdout: "/usr/bin/foo", exitCode: 0 }),
    );
    await expect(commandExists("foo")).resolves.toBe(true);
    const [cmd] = execaMock.mock.calls[0]!;
    expect(cmd).toBe("which");
  });

  it("returns false when the probe fails", async () => {
    setPlatform("linux");
    execaMock.mockReturnValueOnce(
      mkExecaResult({ stdout: "", exitCode: 1, failed: true }),
    );
    await expect(commandExists("foo")).resolves.toBe(false);
  });

  it("returns false when probe succeeds but stdout is blank", async () => {
    setPlatform("linux");
    execaMock.mockReturnValueOnce(
      mkExecaResult({ stdout: "   ", exitCode: 0 }),
    );
    await expect(commandExists("foo")).resolves.toBe(false);
  });
});

describe("runner.whichFirst", () => {
  it("returns the first PATH match trimmed", async () => {
    setPlatform("win32");
    execaMock.mockReturnValueOnce(
      mkExecaResult({
        stdout: "C:\\Tools\\foo.exe\r\nC:\\Other\\foo.exe",
        exitCode: 0,
      }),
    );
    await expect(whichFirst("foo")).resolves.toBe("C:\\Tools\\foo.exe");
  });

  it("returns null when the probe fails", async () => {
    setPlatform("linux");
    execaMock.mockReturnValueOnce(
      mkExecaResult({ exitCode: 1, failed: true }),
    );
    await expect(whichFirst("nope")).resolves.toBeNull();
  });

  it("returns null when stdout is empty or whitespace-only", async () => {
    setPlatform("linux");
    execaMock.mockReturnValueOnce(mkExecaResult({ stdout: "   \n   ", exitCode: 0 }));
    await expect(whichFirst("foo")).resolves.toBeNull();
  });

  it("returns null when first line is empty", async () => {
    setPlatform("linux");
    execaMock.mockReturnValueOnce(mkExecaResult({ stdout: "\n/usr/bin/foo", exitCode: 0 }));
    await expect(whichFirst("foo")).resolves.toBeNull();
  });
});

describe("runner.isElevated", () => {
  it("returns true on non-win32 platforms without probing", async () => {
    setPlatform("linux");
    await expect(isElevated()).resolves.toBe(true);
    expect(execaMock).not.toHaveBeenCalled();
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
