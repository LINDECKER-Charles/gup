import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Resolution must never spawn: any execa call is a regression. */
const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

import { commandExists, whichFirst } from "../../../src/core/process/which.js";
import * as runner from "../../../src/core/runner.js";

beforeEach(() => {
  execaMock.mockReset();
});

describe("runner re-exports", () => {
  it("keeps whichFirst and commandExists importable from the runner", () => {
    expect(runner.whichFirst).toBe(whichFirst);
    expect(runner.commandExists).toBe(commandExists);
  });
});

/**
 * PATH lookup runs against a real temporary PATH: the point of the feature is
 * that it touches the filesystem instead of spawning `where` / `which`, so the
 * filesystem is what these tests exercise. Platform-specific rules run on the
 * matching CI leg only.
 */
describe("whichFirst / commandExists", () => {
  const isWindows = process.platform === "win32";
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
