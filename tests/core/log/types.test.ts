import { describe, expect, it } from "vitest";
import { isEventName, isRecordedAt, parseThreshold } from "../../../src/core/log/types.js";

describe("log record helpers", () => {
  it.each([
    ["scan.ownership-excluded", true],
    ["session.start", true],
    ["a.b.c", true],
    ["nodot", false],
    ["Scan.start", false],
    ["scan..start", false],
    [".start", false],
    ["scan start", false],
    [`x.${"y".repeat(47)}`, false],
  ])("accepts %j as an event name: %s", (name, expected) => {
    expect(isEventName(name)).toBe(expected);
  });

  it("parses a threshold whatever its case and spacing, and refuses anything else", () => {
    expect(parseThreshold(" Debug ")).toBe("debug");
    expect(parseThreshold("off")).toBe("off");
    expect(parseThreshold("verbose")).toBeNull();
    expect(parseThreshold(undefined)).toBeNull();
  });

  it("records a level at its threshold and every more severe one, nothing when off", () => {
    expect(isRecordedAt("error", "warn")).toBe(true);
    expect(isRecordedAt("warn", "warn")).toBe(true);
    expect(isRecordedAt("info", "warn")).toBe(false);
    expect(isRecordedAt("error", "off")).toBe(false);
    expect(isRecordedAt("trace", "trace")).toBe(true);
  });
});
