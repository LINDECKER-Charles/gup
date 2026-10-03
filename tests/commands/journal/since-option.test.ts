import { describe, expect, it } from "vitest";
import { parseSince } from "../../../src/commands/journal/since-option.js";

const NOW = new Date(2026, 2, 31, 15, 30, 0);

function since(raw: string): Date | null | "invalid" {
  const value = parseSince(raw, NOW);
  return value.isValid ? value.since : "invalid";
}

describe("parseSince", () => {
  it("reads spans back from now in days and weeks", () => {
    expect(since("7d")).toEqual(new Date(2026, 2, 24, 15, 30, 0));
    expect(since("2w")).toEqual(new Date(2026, 2, 17, 15, 30, 0));
  });

  it("counts months and years on the calendar, clamped to the month's last day", () => {
    expect(since("1m")).toEqual(new Date(2026, 1, 28, 15, 30, 0));
    expect(since("13m")).toEqual(new Date(2025, 1, 28, 15, 30, 0));
    expect(since("1y")).toEqual(new Date(2025, 2, 31, 15, 30, 0));
  });

  it("reads a calendar date as its local midnight, and all as no bound", () => {
    expect(since("2026-03-01")).toEqual(new Date(2026, 2, 1));
    expect(since(" ALL ")).toBeNull();
  });

  it.each(["", "3x", "0d", "-1d", "11y", "2026-02-30", "2026-04-01", "yesterday", "7"])(
    "refuses %j",
    (raw) => {
      expect(since(raw)).toBe("invalid");
    },
  );
});
