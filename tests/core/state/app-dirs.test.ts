import { posix, win32 } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn(() => "/home/u") }));
vi.mock("node:os", () => ({ homedir: homedirMock }));

import { configDir, stateDir, type StateKind } from "../../../src/core/state/app-dirs.js";

const LOCAL = "C:\\Users\\u\\AppData\\Local";
const ROAMING = "C:\\Users\\u\\AppData\\Roaming";
const KINDS: readonly StateKind[] = ["history", "logs", "reports", "scheduler"];

const windows = (env: NodeJS.ProcessEnv = {}) => ({ platform: "win32" as const, env });
const mac = (env: NodeJS.ProcessEnv = {}) => ({ platform: "darwin" as const, env, home: "/Users/u" });
const linux = (env: NodeJS.ProcessEnv = {}) => ({ platform: "linux" as const, env, home: "/home/u" });

afterEach(() => {
  homedirMock.mockReset();
  homedirMock.mockReturnValue("/home/u");
});

describe("stateDir", () => {
  it.each(KINDS)("puts %s under %%LOCALAPPDATA%%\\gup on Windows, with Windows separators", (kind) => {
    expect(stateDir(kind, windows({ LOCALAPPDATA: LOCAL }))).toBe(win32.join(LOCAL, "gup", kind));
  });

  it("puts state under Application Support on macOS, and logs where Console.app looks", () => {
    const support = posix.join("/Users/u", "Library", "Application Support", "gup");
    expect(stateDir("history", mac())).toBe(posix.join(support, "history"));
    expect(stateDir("reports", mac())).toBe(posix.join(support, "reports"));
    expect(stateDir("scheduler", mac())).toBe(posix.join(support, "scheduler"));
    expect(stateDir("logs", mac())).toBe("/Users/u/Library/Logs/gup");
  });

  it("follows $XDG_STATE_HOME on Linux, else ~/.local/state", () => {
    expect(stateDir("logs", linux({ XDG_STATE_HOME: "/var/state/u" }))).toBe(
      "/var/state/u/gup/logs",
    );
    expect(stateDir("scheduler", linux())).toBe("/home/u/.local/state/gup/scheduler");
  });

  it.each([
    ["history", "GUP_HISTORY_DIR"],
    ["logs", "GUP_LOG_DIR"],
    ["reports", "GUP_REPORT_DIR"],
    ["scheduler", "GUP_SCHEDULER_DIR"],
  ] as const)("lets %s's override (%s) win on every platform", (kind, variable) => {
    const env = { [variable]: "/sandbox/x", LOCALAPPDATA: LOCAL };
    expect(stateDir(kind, windows(env))).toBe("/sandbox/x");
    expect(stateDir(kind, mac(env))).toBe("/sandbox/x");
    expect(stateDir(kind, linux(env))).toBe("/sandbox/x");
  });

  it("ignores an empty override", () => {
    expect(stateDir("history", linux({ GUP_HISTORY_DIR: "" }))).toBe(
      "/home/u/.local/state/gup/history",
    );
  });

  it("gives no directory when the platform offers no anchor", () => {
    expect(stateDir("history", windows())).toBeNull();
    expect(stateDir("logs", { platform: "darwin", env: {}, home: "" })).toBeNull();
    expect(stateDir("history", { platform: "linux", env: {}, home: "" })).toBeNull();
  });

  it("falls back to $HOME, then to nothing, when homedir() is empty", () => {
    homedirMock.mockReturnValue("");
    expect(stateDir("history", { platform: "linux", env: { HOME: "/mnt/u" } })).toBe(
      "/mnt/u/.local/state/gup/history",
    );
    expect(stateDir("history", { platform: "linux", env: {} })).toBeNull();
  });

  it("survives a homedir() that throws", () => {
    homedirMock.mockImplementation(() => {
      throw new Error("no passwd entry");
    });
    expect(stateDir("history", { platform: "linux", env: { HOME: "/mnt/u" } })).toBe(
      "/mnt/u/.local/state/gup/history",
    );
  });

  it("reads the running process when no context is given", () => {
    vi.stubEnv("GUP_REPORT_DIR", "/from/env");
    try {
      expect(stateDir("reports")).toBe("/from/env");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("configDir", () => {
  it("roams with the user on Windows", () => {
    expect(configDir(windows({ APPDATA: ROAMING, LOCALAPPDATA: LOCAL }))).toBe(
      win32.join(ROAMING, "gup"),
    );
  });

  it("uses Application Support on macOS and XDG config elsewhere", () => {
    expect(configDir(mac())).toBe("/Users/u/Library/Application Support/gup");
    expect(configDir(linux({ XDG_CONFIG_HOME: "/cfg" }))).toBe("/cfg/gup");
    expect(configDir(linux())).toBe("/home/u/.config/gup");
  });

  it("lets GUP_CONFIG_DIR win", () => {
    expect(configDir(windows({ GUP_CONFIG_DIR: "D:\\gup", APPDATA: ROAMING }))).toBe("D:\\gup");
  });

  it("gives no directory without %APPDATA% on Windows", () => {
    expect(configDir(windows({ LOCALAPPDATA: LOCAL }))).toBeNull();
  });
});
