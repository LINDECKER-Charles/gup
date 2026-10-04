import { describe, expect, it } from "vitest";
import type { SimPlatform, SystemSpec } from "../support/system/types.js";
import { rebasePath, rebaseSystem } from "./rebase-machine.js";

/** How the platform simulation moves a contract case's machine to another OS. */

interface Move {
  readonly label: string;
  readonly path: string;
  readonly from: SimPlatform;
  readonly to: SimPlatform;
  readonly moved: string;
}

const MOVES: readonly Move[] = [
  {
    label: "a Windows home path",
    path: "C:\\Users\\u\\scoop\\shims\\tofu.exe",
    from: "win32",
    to: "darwin",
    moved: "/Users/u/scoop/shims/tofu",
  },
  {
    label: "a Windows home path, any case",
    path: "c:\\users\\U\\.cargo\\bin\\cargo.exe",
    from: "win32",
    to: "linux",
    moved: "/home/u/.cargo/bin/cargo",
  },
  {
    label: "a Windows system path",
    path: "C:\\Program Files\\Git\\cmd\\git.cmd",
    from: "win32",
    to: "linux",
    moved: "/Program Files/Git/cmd/git",
  },
  {
    label: "a macOS home path",
    path: "/Users/u/.nvm/nvm.sh",
    from: "darwin",
    to: "linux",
    moved: "/home/u/.nvm/nvm.sh",
  },
  {
    label: "a POSIX system path",
    path: "/opt/homebrew/bin/brew",
    from: "darwin",
    to: "win32",
    moved: "C:\\opt\\homebrew\\bin\\brew",
  },
  {
    label: "a Linux home path",
    path: "/home/u/.local/bin/pipx",
    from: "linux",
    to: "win32",
    moved: "C:\\Users\\u\\.local\\bin\\pipx",
  },
  { label: "the home itself", path: "/home/u", from: "linux", to: "darwin", moved: "/Users/u" },
  {
    label: "a home look-alike, as a system path",
    path: "/Users/uu/x",
    from: "darwin",
    to: "linux",
    moved: "/Users/uu/x",
  },
];

describe("rebasePath", () => {
  it.each(MOVES)("moves $label", ({ path, from, to, moved }) => {
    expect(rebasePath(path, from, to)).toBe(moved);
  });

  it.each([
    ["a bare name", "tofu"],
    ["an option", "--json"],
    ["a relative path", "bin\\tofu.exe"],
  ])("leaves %s alone", (_label, value) => {
    expect(rebasePath(value, "win32", "darwin")).toBe(value);
  });
});

describe("rebaseSystem", () => {
  const WINDOWS: SystemSpec = {
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local", GUP_FLAG: "on" },
    bin: { tofu: "C:\\Users\\u\\scoop\\shims\\tofu.exe" },
    commands: [
      { argv: ["tofu", "version"], stdout: "OpenTofu v1.7.2" },
      { argv: ["C:\\Tools\\py.exe", "-V"], stdout: "Python 3.12.0" },
      { argv: ["C:\\Tools\\py.cmd", "-V"], stdout: "never asked" },
    ],
    http: [{ url: "https://api.github.com/repos/opentofu/opentofu/releases/latest", json: {} }],
    fs: {
      "C:\\Users\\u\\.tofurc": { kind: "file", content: "x" },
      "C:\\Users\\u\\link": { kind: "symlink", target: "C:\\Users\\u\\.tofurc" },
    },
    elevated: true,
  };

  it("spells every path of the machine the target's way, and keeps the rest", () => {
    expect(rebaseSystem(WINDOWS, "darwin")).toEqual({
      platform: "darwin",
      env: { LOCALAPPDATA: "/Users/u/AppData/Local", GUP_FLAG: "on" },
      bin: { tofu: "/Users/u/scoop/shims/tofu" },
      commands: [
        { argv: ["tofu", "version"], stdout: "OpenTofu v1.7.2" },
        { argv: ["/Tools/py", "-V"], stdout: "Python 3.12.0" },
      ],
      http: WINDOWS.http,
      fs: {
        "/Users/u/.tofurc": { kind: "file", content: "x" },
        "/Users/u/link": { kind: "symlink", target: "/Users/u/.tofurc" },
      },
      elevated: true,
    });
  });

  it("drops the POSIX uid on Windows and keeps it elsewhere", () => {
    const mac: SystemSpec = { platform: "darwin", uid: 0 };
    expect(rebaseSystem(mac, "win32")).toEqual({ platform: "win32" });
    expect(rebaseSystem(mac, "linux")).toEqual({ platform: "linux", uid: 0 });
  });
});
