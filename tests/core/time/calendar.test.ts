import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDays,
  dayKeyOf,
  dayOfMonth,
  daysBetween,
  monthOf,
  weekdayOf,
  weekStartOf,
} from "../../../src/core/time/calendar.js";

describe("calendar days", () => {
  it("names a day by its local date", () => {
    expect(dayKeyOf(new Date(2026, 9, 3, 23, 59))).toBe("2026-10-03");
    expect(dayKeyOf(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("starts weeks on Monday", () => {
    expect(weekdayOf("2026-10-05")).toBe(0);
    expect(weekdayOf("2026-10-04")).toBe(6);
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28");
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05");
  });

  it("moves across months, years and DST changes by whole days", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-05", "2026-09-28")).toBe(-7);
  });

  it("compares, and reads the month and the day of a key", () => {
    expect(compareDays("2026-09-30", "2026-10-01")).toBeLessThan(0);
    expect(compareDays("2026-10-01", "2026-10-01")).toBe(0);
    expect(monthOf("2026-10-03")).toBe(9);
    expect(dayOfMonth("2026-10-03")).toBe(3);
  });

  it("refuses what is not a day key", () => {
    expect(() => addDays("03/10/2026", 1)).toThrow(RangeError);
  });
});
