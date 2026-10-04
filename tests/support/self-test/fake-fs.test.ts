import { appendFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import {
  access,
  constants,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { fixture } from "../fixtures/refs.js";
import { FakeSystemUsageError } from "../system/errors.js";
import { system } from "../system/fake-system.js";

const CELLAR_KUBECTL = "/opt/homebrew/Cellar/kubernetes-cli/1.36.3/bin/kubectl";

describe("fake fs: path semantics follow the simulated OS", () => {
  it("is case-insensitive and separator-agnostic on win32", async () => {
    await system.load({
      platform: "win32",
      fs: { "C:\\Users\\u\\AppData\\Local\\gup\\x.txt": { kind: "file", content: "hi" } },
    });

    expect(existsSync("c:/users/U/appdata/local/GUP/X.TXT")).toBe(true);
    await expect(readFile("C:/Users/u/AppData/Local/gup/x.txt", "utf8")).resolves.toBe("hi");
  });

  it("is case-sensitive and treats a backslash as a plain character on POSIX", async () => {
    await system.load({ platform: "darwin", fs: { "/Users/u/.config/x": { kind: "file" } } });

    expect(existsSync("/Users/u/.config/x")).toBe(true);
    expect(existsSync("/users/u/.config/x")).toBe(false);
    // What a host `join` produces for a darwin path on a Windows host:
    expect(existsSync(win32.join("/Users/u", ".config", "x"))).toBe(false);
    expect(existsSync(posix.join("/Users/u", ".config", "x"))).toBe(true);
  });

  it("implies parents and lists children by name, sorted, in their declared case", async () => {
    await system.load({
      platform: "linux",
      fs: {
        "/opt/tools/Zeta/bin": { kind: "dir" },
        "/opt/tools/alpha.txt": { kind: "file" },
      },
    });

    await expect(readdir("/opt/tools")).resolves.toEqual(["Zeta", "alpha.txt"]);
    await expect(stat("/opt/tools/Zeta")).resolves.toMatchObject({ size: 0 });
    expect((await stat("/opt")).isDirectory()).toBe(true);
  });

  it("gives every machine a home and a temp directory", async () => {
    await system.load({ platform: "darwin" });

    expect(existsSync(homedir())).toBe(true);
    expect(existsSync(tmpdir())).toBe(true);
  });

  it("puts every `bin` entry on disk as an executable file", async () => {
    await system.load({ platform: "linux", bin: { pip: "/usr/bin/pip" } });

    await expect(access("/usr/bin/pip", constants.X_OK)).resolves.toBeUndefined();
  });

  it("never resolves a relative path", async () => {
    await system.load({ platform: "linux", fs: { "/w/x": { kind: "file" } } });

    expect(existsSync("x")).toBe(false);
  });
});

describe("fake fs: reads", () => {
  it("returns a string with an encoding and a Buffer without", async () => {
    await system.load({ platform: "linux", fs: { "/f": { kind: "file", content: "é" } } });

    await expect(readFile("/f", "utf8")).resolves.toBe("é");
    await expect(readFile("/f", { encoding: "utf8" })).resolves.toBe("é");
    expect(Buffer.isBuffer(await readFile("/f"))).toBe(true);
  });

  it("loads file content from a recorded fixture", async () => {
    await system.load({
      platform: "linux",
      fs: { "/f": { kind: "file", content: fixture("self-test/hello.txt") } },
    });

    await expect(readFile("/f", "utf8")).resolves.toBe("hello from a fixture\n");
  });

  it("raises the real error codes", async () => {
    await system.load({ platform: "linux", fs: { "/d/f": { kind: "file" } } });

    await expect(readFile("/nope")).rejects.toMatchObject({ code: "ENOENT", syscall: "open" });
    await expect(readFile("/d")).rejects.toMatchObject({ code: "EISDIR" });
    await expect(readdir("/d/f")).rejects.toMatchObject({ code: "ENOTDIR" });
    await expect(stat("/d/f/below")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("follows relative symlinks through realpath, stat and readFile, but not lstat", async () => {
    await system.load({
      platform: "darwin",
      fs: {
        "/opt/homebrew/bin/kubectl": {
          kind: "symlink",
          target: "../Cellar/kubernetes-cli/1.36.3/bin/kubectl",
        },
        [CELLAR_KUBECTL]: { kind: "file", content: "#!", executable: true },
      },
    });

    await expect(realpath("/opt/homebrew/bin/kubectl")).resolves.toBe(CELLAR_KUBECTL);
    expect((await stat("/opt/homebrew/bin/kubectl")).isFile()).toBe(true);
    expect((await lstat("/opt/homebrew/bin/kubectl")).isSymbolicLink()).toBe(true);
    await expect(readFile("/opt/homebrew/bin/kubectl", "utf8")).resolves.toBe("#!");
  });

  it("follows a symlinked directory in the middle of a path", async () => {
    await system.load({
      platform: "linux",
      fs: {
        "/usr/local/opt": { kind: "symlink", target: "/srv/opt" },
        "/srv/opt/tool": { kind: "file" },
      },
    });

    await expect(realpath("/usr/local/opt/tool")).resolves.toBe("/srv/opt/tool");
  });

  it("detects a symlink loop", async () => {
    await system.load({
      platform: "linux",
      fs: { "/a": { kind: "symlink", target: "/b" }, "/b": { kind: "symlink", target: "/a" } },
    });

    await expect(realpath("/a")).rejects.toMatchObject({ code: "ELOOP" });
    expect(existsSync("/a")).toBe(false);
  });

  it("checks the exec bit on POSIX only", async () => {
    await system.load({ platform: "linux", fs: { "/x": { kind: "file", executable: false } } });
    await expect(access("/x", constants.X_OK)).rejects.toMatchObject({ code: "EACCES" });
    await expect(access("/x")).resolves.toBeUndefined();

    const exe = { kind: "file", executable: false } as const;
    await system.load({ platform: "win32", fs: { "C:\\x.exe": exe } });
    await expect(access("C:\\x.exe", constants.X_OK)).resolves.toBeUndefined();
  });

  it("traces every path read, as spelled by the caller", async () => {
    await system.load({ platform: "linux", fs: { "/f": { kind: "file" } } });

    existsSync("/f");
    await readFile("/f").catch(() => undefined);
    await stat("/missing").catch(() => undefined);

    expect(system.trace.fsReads).toEqual(["/f", "/f", "/missing"]);
  });
});

describe("fake fs: writes land in the tree", () => {
  it("writes, appends, copies and removes files", async () => {
    await system.load({ platform: "linux", fs: { "/w": { kind: "dir" } } });

    await writeFile("/w/a.txt", "one");
    appendFileSync("/w/a.txt", "+two");
    await copyFile("/w/a.txt", "/w/b.txt");
    await rm("/w/a.txt");

    expect(existsSync("/w/a.txt")).toBe(false);
    await expect(readFile("/w/b.txt", "utf8")).resolves.toBe("one+two");
  });

  it("refuses to write into a missing directory", async () => {
    await system.load({ platform: "linux" });

    await expect(writeFile("/nowhere/a.txt", "x")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates directories like mkdir and mkdir -p", async () => {
    await system.load({ platform: "win32" });

    await expect(mkdir("C:\\a\\b\\c", { recursive: true })).resolves.toBe("C:\\a");
    await expect(mkdir("C:\\a\\b\\c", { recursive: true })).resolves.toBeUndefined();
    await expect(mkdir("C:\\a\\b")).rejects.toMatchObject({ code: "EEXIST" });
    await expect(mkdir("C:\\x\\y")).rejects.toMatchObject({ code: "ENOENT" });
    mkdirSync("C:\\a\\b\\d");
    expect(existsSync("C:\\a\\b\\d")).toBe(true);
  });

  it("creates uniquely named temp directories", async () => {
    await system.load({ platform: "win32" });

    const first = await mkdtemp(win32.join(tmpdir(), "gup-nerd-"));
    const second = await mkdtemp(win32.join(tmpdir(), "gup-nerd-"));

    expect(first).not.toBe(second);
    expect(first.startsWith(win32.join(tmpdir(), "gup-nerd-"))).toBe(true);
    expect((await stat(second)).isDirectory()).toBe(true);
  });

  it("removes a directory only recursively, and a missing path only when forced", async () => {
    await system.load({ platform: "linux", fs: { "/d/f": { kind: "file" } } });

    await expect(rm("/d")).rejects.toMatchObject({ code: "ERR_FS_EISDIR" });
    await expect(rm("/nope")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(rm("/nope", { force: true })).resolves.toBeUndefined();
    await rm("/d", { recursive: true });

    expect(existsSync("/d/f")).toBe(false);
  });

  it("renames a directory with all it holds, and removes only an empty one", async () => {
    await system.load({
      platform: "win32",
      fs: {
        "C:\\n\\.pkg-Ab3dEf9h\\package.json": { kind: "file", content: "{}" },
        "C:\\n\\pkg": { kind: "dir" },
      },
    });

    await expect(rename("C:\\n\\.pkg-Ab3dEf9h", "C:\\n\\pkg")).rejects.toMatchObject({
      code: "EPERM",
    });
    await expect(rmdir("C:\\n\\.pkg-Ab3dEf9h")).rejects.toMatchObject({ code: "ENOTEMPTY" });
    await rmdir("C:\\n\\pkg");
    await rename("C:\\n\\.pkg-Ab3dEf9h", "C:\\n\\pkg");

    await expect(readFile("C:\\n\\pkg\\package.json", "utf8")).resolves.toBe("{}");
    await expect(readdir("C:\\n")).resolves.toEqual(["pkg"]);
    await expect(rename("C:\\n\\gone", "C:\\n\\x")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(rename("C:\\n\\pkg", "C:\\m\\pkg")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(rmdir("C:\\n\\gone")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replaces a file, or an empty directory on POSIX, as rename(2) does", async () => {
    await system.load({
      platform: "linux",
      fs: {
        "/w/a": { kind: "file", content: "a" },
        "/w/b": { kind: "file", content: "b" },
        "/w/d/x": { kind: "file" },
        "/w/e": { kind: "dir" },
        "/w/f/y": { kind: "file" },
      },
    });

    await rename("/w/a", "/w/b");
    await rename("/w/d", "/w/e");

    await expect(readFile("/w/b", "utf8")).resolves.toBe("a");
    expect(existsSync("/w/e/x")).toBe(true);
    await expect(rename("/w/e", "/w/f")).rejects.toMatchObject({ code: "ENOTEMPTY" });
    await expect(rmdir("/w/b")).rejects.toMatchObject({ code: "ENOTDIR" });
  });
});

describe("fake fs: faults and limits", () => {
  it("makes a path and everything below it absent with `missing`", async () => {
    await system.load({ platform: "linux", fs: { "/d/f": { kind: "file" } } });
    system.inject({ on: "fs", path: "/d", mode: "missing" });

    expect(existsSync("/d/f")).toBe(false);
    await expect(readFile("/d/f")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("denies every access but existence with `eacces`", async () => {
    await system.load({ platform: "linux", fs: { "/d/f": { kind: "file" } } });
    system.inject({ on: "fs", path: "/d/f", mode: "eacces" });

    expect(existsSync("/d/f")).toBe(true);
    await expect(readFile("/d/f")).rejects.toMatchObject({ code: "EACCES" });
    await expect(writeFile("/d/f", "x")).rejects.toMatchObject({ code: "EACCES" });
  });

  it("lets every undeclared path exist, empty, on a permissive machine", async () => {
    await system.load({ platform: "linux", permissive: true });

    expect(existsSync("/any/where")).toBe(true);
    await expect(readFile("/any/where", "utf8")).resolves.toBe("");
    await expect(readdir("/any/where")).resolves.toEqual([]);
  });

  it("turns an unmodelled fs function into a recorded usage error, not real I/O", async () => {
    await system.load({ platform: "linux", fs: { "/f": { kind: "file" } } });

    expect(() => chmodSync("/f", 0o600)).toThrow(FakeSystemUsageError);
    await expect(readdir("/", { withFileTypes: true })).rejects.toThrow(FakeSystemUsageError);
    expect(system.unscripted).toHaveLength(2);
    system.acknowledgeUnscripted();
  });

  it("refuses a relative path in a machine description", async () => {
    await expect(
      system.load({ platform: "linux", fs: { "relative/x": { kind: "file" } } }),
    ).rejects.toThrow("absolute");
  });
});
