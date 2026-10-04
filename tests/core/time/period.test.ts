import { describe, expect, it } from "vitest";
import {
  isWithin,
  nextPeriod,
  parsePeriod,
  parseUntil,
  PERIOD_CYCLE,
  presetPeriod,
  withUntil,
} from "../../../src/core/time/period.js";

const NOW = new Date(2026, 2, 31, 15, 30, 0);

function since(raw: string): Date | null | "invalid" {
  const period = parsePeriod(raw, NOW);
  return period === null ? "invalid" : period.since;
}

describe("parsePeriod", () => {
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

  it("ends every period now, and describes what it covers", () => {
    expect(parsePeriod("12M", NOW)).toEqual({
      key: "12m",
      scope: { kind: "span", count: 12, unit: "m" },
      since: new Date(2025, 2, 31, 15, 30, 0),
      until: NOW,
      hasFixedEnd: false,
    });
    expect(parsePeriod("2026-03-01", NOW)?.scope).toEqual({ kind: "date" });
    expect(parsePeriod("all", NOW)?.scope).toEqual({ kind: "all" });
  });

  it.each(["", "3x", "0d", "-1d", "11y", "2026-02-30", "2026-04-01", "yesterday", "7"])(
    "refuses %j",
    (raw) => {
      expect(since(raw)).toBe("invalid");
    },
  );
});

describe("the period cycle", () => {
  it("steps through the presets, shortest first, and wraps", () => {
    const keys = [presetPeriod("30d", NOW)];
    for (let step = 0; step < PERIOD_CYCLE.length; step++) keys.push(nextPeriod(keys.at(-1)!, NOW));
    expect(keys.map((period) => period.key)).toEqual(["30d", "90d", "12m", "all", "30d"]);
  });

  it("starts the cycle over from a period that is not a preset", () => {
    expect(nextPeriod(parsePeriod("2026-01-01", NOW)!, NOW).key).toBe("30d");
  });
});

describe("until", () => {
  it("reads an end date as the last instant of that local day", () => {
    expect(parseUntil("2026-03-15")).toEqual(new Date(2026, 2, 15, 23, 59, 59, 999));
    expect(parseUntil("2026-02-30")).toBeNull();
    expect(parseUntil("15/03/2026")).toBeNull();
  });

  it("moves the end of a period, never before its start", () => {
    const period = parsePeriod("2026-03-01", NOW)!;
    expect(withUntil(period, new Date(2026, 2, 15))).toMatchObject({
      until: new Date(2026, 2, 15),
      hasFixedEnd: true,
    });
    expect(withUntil(period, new Date(2026, 1, 1))).toBeNull();
  });

  it("includes both ends of the period", () => {
    const period = withUntil(parsePeriod("2026-03-01", NOW)!, new Date(2026, 2, 15))!;
    expect(isWithin(period, new Date(2026, 2, 1).getTime())).toBe(true);
    expect(isWithin(period, new Date(2026, 2, 15).getTime())).toBe(true);
    expect(isWithin(period, new Date(2026, 1, 28).getTime())).toBe(false);
    expect(isWithin(period, new Date(2026, 2, 15, 0, 0, 1).getTime())).toBe(false);
    expect(isWithin(parsePeriod("all", NOW)!, 0)).toBe(true);
  });
});
