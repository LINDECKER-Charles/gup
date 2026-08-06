import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { posix as posixPath, win32 as winPath } from "node:path";
import { nvimConfigDir, nvimDataDir } from "../../src/core/nvim-paths.js";

/**
 * Expectations are built with the *target* platform's joiner, never the host's:
 * these tests force `process.platform`, so a bare `join()` would assert
 * backslashes on a Windows runner and forward slashes on macOS/Linux for the
 * exact same case — passing on one leg of the CI matrix and failing on another.
 */

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

describe("nvim-paths", () => {
  const originalPlatform = process.platform;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env["LOCALAPPDATA"];
    delete process.env["XDG_CONFIG_HOME"];
    delete process.env["XDG_DATA_HOME"];
    delete process.env["HOME"];
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    process.env = savedEnv;
    vi.restoreAllMocks();
  });

  describe("nvimConfigDir", () => {
    it("uses LOCALAPPDATA on win32", () => {
      setPlatform("win32");
      process.env["LOCALAPPDATA"] = "C:\\Users\\me\\AppData\\Local";
      expect(nvimConfigDir()).toBe(
        winPath.join("C:\\Users\\me\\AppData\\Local", "nvim"),
      );
    });

    it("returns empty string on win32 when LOCALAPPDATA is unset", () => {
      setPlatform("win32");
      expect(nvimConfigDir()).toBe("");
    });

    it("prefers XDG_CONFIG_HOME on posix", () => {
      setPlatform("linux");
      process.env["XDG_CONFIG_HOME"] = "/custom/xdg";
      process.env["HOME"] = "/home/me";
      expect(nvimConfigDir()).toBe(posixPath.join("/custom/xdg", "nvim"));
    });

    it("falls back to $HOME/.config/nvim on posix when XDG_CONFIG_HOME is unset", () => {
      setPlatform("linux");
      process.env["HOME"] = "/home/me";
      expect(nvimConfigDir()).toBe(posixPath.join("/home/me", ".config", "nvim"));
    });

    it("returns empty string on posix when HOME is also unset", () => {
      setPlatform("linux");
      expect(nvimConfigDir()).toBe("");
    });
  });

  describe("nvimDataDir", () => {
    it("uses LOCALAPPDATA\\nvim-data on win32", () => {
      setPlatform("win32");
      process.env["LOCALAPPDATA"] = "C:\\Users\\me\\AppData\\Local";
      expect(nvimDataDir()).toBe(
        winPath.join("C:\\Users\\me\\AppData\\Local", "nvim-data"),
      );
    });

    it("returns empty string on win32 when LOCALAPPDATA is unset", () => {
      setPlatform("win32");
      expect(nvimDataDir()).toBe("");
    });

    it("prefers XDG_DATA_HOME on posix", () => {
      setPlatform("linux");
      process.env["XDG_DATA_HOME"] = "/custom/data";
      process.env["HOME"] = "/home/me";
      expect(nvimDataDir()).toBe(posixPath.join("/custom/data", "nvim"));
    });

    it("falls back to $HOME/.local/share/nvim on posix when XDG_DATA_HOME is unset", () => {
      setPlatform("linux");
      process.env["HOME"] = "/home/me";
      expect(nvimDataDir()).toBe(
        posixPath.join("/home/me", ".local", "share", "nvim"),
      );
    });

    it("returns empty string on posix when HOME is also unset", () => {
      setPlatform("linux");
      expect(nvimDataDir()).toBe("");
    });
  });

  describe("macOS", () => {
    // Neovim follows XDG on macOS exactly as on Linux — it does NOT use
    // ~/Library/Application Support. The POSIX branch therefore covers darwin
    // as-is; this pins that so nobody "fixes" it into an Apple-specific path.
    it("resolves config and data through XDG, same as Linux", () => {
      setPlatform("darwin");
      process.env["HOME"] = "/Users/me";
      expect(nvimConfigDir()).toBe(posixPath.join("/Users/me", ".config", "nvim"));
      expect(nvimDataDir()).toBe(
        posixPath.join("/Users/me", ".local", "share", "nvim"),
      );
    });

    it("honours XDG overrides on darwin", () => {
      setPlatform("darwin");
      process.env["HOME"] = "/Users/me";
      process.env["XDG_CONFIG_HOME"] = "/Users/me/cfg";
      process.env["XDG_DATA_HOME"] = "/Users/me/data";
      expect(nvimConfigDir()).toBe(posixPath.join("/Users/me/cfg", "nvim"));
      expect(nvimDataDir()).toBe(posixPath.join("/Users/me/data", "nvim"));
    });
  });
});
