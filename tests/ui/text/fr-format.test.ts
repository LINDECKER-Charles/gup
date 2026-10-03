import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatCount,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatPercent,
  formatRelative,
} from "../../../src/ui/text/fr-format.js";

/** Every result must be as wide as it is long: plain spaces only. */
const NARROW_SPACES = /[  ]/;
/** Local time, like the formatters: the expectations hold in any time zone. */
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 9, day, hours, minutes);
const NOW = at(3, 14, 22);

describe("French numbers", () => {
  it("groups thousands and writes decimals with a comma", () => {
    expect(formatCount(1284)).toBe("1 284");
    expect(formatCount(1234567)).toBe("1 234 567");
    expect(formatDecimal(6.14, 1)).toBe("6,1");
    expect(formatDecimal(2, 2)).toBe("2,00");
    expect(formatPercent(0.97)).toBe("97 %");
  });

  it("never emits a narrow or non-breaking space", () => {
    for (const text of [formatCount(1_234_567), formatPercent(0.5), formatDecimal(12345.6, 1)]) {
      expect(text).not.toMatch(NARROW_SPACES);
    }
  });
});

describe("French durations", () => {
  it("reads in seconds, then minutes, then hours", () => {
    expect(formatDuration(18_400)).toBe("18,4 s");
    expect(formatDuration(400)).toBe("0,4 s");
    expect(formatDuration(134_000)).toBe("2 min 14 s");
    expect(formatDuration(64_000)).toBe("1 min 04 s");
    expect(formatDuration(3_900_000)).toBe("1 h 05");
  });

  it("does not show 60,0 s at the edge of a minute", () => {
    expect(formatDuration(59_960)).toBe("1 min 00 s");
  });

  it("treats a negative or unknown duration as nothing", () => {
    expect(formatDuration(-5)).toBe("0,0 s");
    expect(formatDuration(Number.NaN)).toBe("0,0 s");
  });

  it("runs a clock in minutes, then hours", () => {
    expect(formatClock(72_000)).toBe("01:12");
    expect(formatClock(3_723_000)).toBe("1:02:03");
    expect(formatClock(999)).toBe("00:00");
  });
});

describe("French dates", () => {
  it("writes day first, with leading zeros", () => {
    expect(formatDate(at(3, 9))).toBe("03/10/2026");
    expect(formatDateTime(at(3, 14, 22))).toBe("03/10 14:22");
  });

  it("says how long ago something happened", () => {
    expect(formatRelative(new Date(2026, 9, 3, 14, 21, 30), NOW)).toBe("à l'instant");
    expect(formatRelative(at(3, 14, 18), NOW)).toBe("il y a 4 min");
    expect(formatRelative(at(3, 11, 0), NOW)).toBe("il y a 3 h");
    expect(formatRelative(at(2, 9, 3), NOW)).toBe("hier 09:03");
    expect(formatRelative(at(28, 9, 3), at(30, 8))).toBe("28/10 09:03");
    expect(formatRelative(new Date(2025, 8, 28, 9, 3), NOW)).toBe("28/09/2025 09:03");
  });

  it("says when something will happen", () => {
    expect(formatRelative(at(3, 16, 0), NOW)).toBe("aujourd'hui 16:00");
    expect(formatRelative(at(4, 9, 0), NOW)).toBe("demain 09:00");
    expect(formatRelative(at(5, 9, 0), NOW)).toBe("lun. 5 oct. 09:00");
    expect(formatRelative(new Date(2027, 0, 4, 9, 0), NOW)).toBe("04/01/2027 09:00");
  });
});
