import { describe, expect, it } from "vitest";
import { configFilePath, isConfigDisabled } from "../../../src/core/config/paths.js";

describe("configFilePath", () => {
  it("lives in the roaming profile on Windows", () => {
    expect(
      configFilePath({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\a\\AppData\\Roaming" },
        home: "C:\\Users\\a",
      }),
    ).toBe("C:\\Users\\a\\AppData\\Roaming\\gup\\config.json");
  });

  it("lives in Application Support on macOS", () => {
    expect(configFilePath({ platform: "darwin", env: {}, home: "/Users/a" })).toBe(
      "/Users/a/Library/Application Support/gup/config.json",
    );
  });

  it("follows XDG_CONFIG_HOME on Linux, else ~/.config", () => {
    expect(configFilePath({ platform: "linux", env: { XDG_CONFIG_HOME: "/x/cfg" }, home: "/home/a" })).toBe(
      "/x/cfg/gup/config.json",
    );
    expect(configFilePath({ platform: "linux", env: {}, home: "/home/a" })).toBe(
      "/home/a/.config/gup/config.json",
    );
  });

  it("honours GUP_CONFIG_DIR before anything else", () => {
    expect(
      configFilePath({ platform: "linux", env: { GUP_CONFIG_DIR: "/tmp/gup-cfg" }, home: "/home/a" }),
    ).toBe("/tmp/gup-cfg/config.json");
  });

  it("is null when the platform gives no anchor", () => {
    expect(configFilePath({ platform: "win32", env: {}, home: "" })).toBeNull();
    expect(configFilePath({ platform: "linux", env: {}, home: "" })).toBeNull();
  });
});

describe("isConfigDisabled", () => {
  it.each(["0", "false", "off", "no", " OFF "])("turns the store off for GUP_CONFIG=%j", (value) => {
    expect(isConfigDisabled({ GUP_CONFIG: value })).toBe(true);
  });

  it.each([undefined, "", "1", "on"])("keeps it on for GUP_CONFIG=%j", (value) => {
    expect(isConfigDisabled(value === undefined ? {} : { GUP_CONFIG: value })).toBe(false);
  });
});
