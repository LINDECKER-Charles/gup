import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { nvimConfigDir, nvimDataDir } from "../../src/core/nvim-paths.js";

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
        join("C:\\Users\\me\\AppData\\Local", "nvim"),
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
      expect(nvimConfigDir()).toBe(join("/custom/xdg", "nvim"));
    });

    it("falls back to $HOME/.config/nvim on posix when XDG_CONFIG_HOME is unset", () => {
      setPlatform("linux");
      process.env["HOME"] = "/home/me";
      expect(nvimConfigDir()).toBe(join("/home/me", ".config", "nvim"));
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
        join("C:\\Users\\me\\AppData\\Local", "nvim-data"),
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
      expect(nvimDataDir()).toBe(join("/custom/data", "nvim"));
    });

    it("falls back to $HOME/.local/share/nvim on posix when XDG_DATA_HOME is unset", () => {
      setPlatform("linux");
      process.env["HOME"] = "/home/me";
      expect(nvimDataDir()).toBe(
        join("/home/me", ".local", "share", "nvim"),
      );
    });

    it("returns empty string on posix when HOME is also unset", () => {
      setPlatform("linux");
      expect(nvimDataDir()).toBe("");
    });
  });
});
