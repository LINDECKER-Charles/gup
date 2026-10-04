import { describe, expect, it } from "vitest";
import { resolveLogSettings, sinkKindFor } from "../../../src/commands/journal/log-settings.js";

describe("resolveLogSettings", () => {
  it("takes --log-level over GUP_LOG_LEVEL over the setting over the default", () => {
    const env = { GUP_LOG_LEVEL: "warn" };
    const setting = "debug";
    expect(resolveLogSettings({ flag: "trace", env, setting })).toEqual({ threshold: "trace", source: "flag" });
    expect(resolveLogSettings({ env, setting })).toEqual({ threshold: "warn", source: "env" });
    expect(resolveLogSettings({ env: {}, setting })).toEqual({ threshold: "debug", source: "setting" });
    expect(resolveLogSettings({ env: {} })).toEqual({ threshold: "info", source: "default" });
  });

  it("reads a setting equal to the default as the default, as the settings file does", () => {
    expect(resolveLogSettings({ env: {}, setting: "info" })).toEqual({ threshold: "info", source: "default" });
  });

  it("lets GUP_LOG_LEVEL=off silence a log the setting asks for", () => {
    expect(resolveLogSettings({ env: { GUP_LOG_LEVEL: "off" }, setting: "trace" })).toEqual({
      threshold: "off",
      source: "env",
    });
  });

  it("falls back to the setting past a GUP_LOG_LEVEL that is not a level", () => {
    expect(resolveLogSettings({ env: { GUP_LOG_LEVEL: "loud" }, setting: "off" })).toEqual({
      threshold: "off",
      source: "setting",
      ignoredEnv: "loud",
    });
  });

  it("honours off exactly, from the flag or the environment", () => {
    expect(resolveLogSettings({ env: { GUP_LOG_LEVEL: "OFF" } }).threshold).toBe("off");
    expect(resolveLogSettings({ flag: "off", env: { GUP_LOG_LEVEL: "debug" } }).threshold).toBe("off");
  });

  it("ignores a GUP_LOG_LEVEL that is not a level, and remembers it for gup doctor", () => {
    expect(resolveLogSettings({ env: { GUP_LOG_LEVEL: "verbose" } })).toEqual({
      threshold: "info",
      source: "default",
      ignoredEnv: "verbose",
    });
  });

  it("raises a scheduled run's quieter threshold to info, and leaves off off", () => {
    const scheduled = (level: string) =>
      resolveLogSettings({ env: { GUP_LOG_LEVEL: level }, trigger: "schedule" }).threshold;
    expect(scheduled("error")).toBe("info");
    expect(scheduled("warn")).toBe("info");
    expect(scheduled("debug")).toBe("debug");
    expect(scheduled("off")).toBe("off");
    expect(resolveLogSettings({ env: { GUP_LOG_LEVEL: "warn" }, trigger: "menu" }).threshold).toBe("warn");
    expect(resolveLogSettings({ env: {}, setting: "error", trigger: "schedule" })).toEqual({
      threshold: "info",
      source: "setting",
    });
  });
});

describe("sinkKindFor", () => {
  it.each([
    ["", "file"],
    ["update", "file"],
    ["__schedule-tick", "file"],
    ["__admin-batch", "memory"],
    ["log", "none"],
    ["log show", "none"],
    ["log export", "none"],
    ["login", "file"],
  ] as const)("sends %j to %s", (commandPath, kind) => {
    expect(sinkKindFor(commandPath)).toBe(kind);
  });
});
