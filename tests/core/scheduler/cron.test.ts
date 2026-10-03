import { describe, expect, it } from "vitest";
import { CronExpression } from "../../../src/core/scheduler/model/cron.js";
import {
  parseMonthDay,
  parseTimeOfDay,
  toCron,
  upcomingRuns,
} from "../../../src/core/scheduler/model/recurrence.js";

// The suite runs with TZ=UTC (tests/support/test-env.ts): local time is UTC.
const SATURDAY_10H = new Date("2026-10-03T10:00:00Z");

function parse(expression: string): CronExpression {
  const parsed = CronExpression.tryParse(expression);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.cron;
}

const iso = (dates: readonly Date[]): string[] => dates.map((d) => d.toISOString());

describe("toCron", () => {
  it("writes each preset as a plain 5-field expression", () => {
    const at = { hour: 9, minute: 5 };
    expect(toCron({ kind: "daily", at })).toBe("5 9 * * *");
    expect(toCron({ kind: "weekly", weekday: 1, at })).toBe("5 9 * * 1");
    expect(toCron({ kind: "weekly", weekday: 0, at })).toBe("5 9 * * 0");
    expect(toCron({ kind: "monthly", day: 15, at })).toBe("5 9 15 * *");
    expect(toCron({ kind: "monthly", day: "last", at })).toBe("5 9 L * *");
  });

  it("keeps a custom expression, whitespace normalised", () => {
    expect(toCron({ kind: "cron", expression: "  0   */6 * *  * " })).toBe("0 */6 * * *");
  });
});

describe("CronExpression", () => {
  it("lists the next occurrences strictly after the reference", () => {
    expect(iso(parse("0 9 * * 1").nextRuns(SATURDAY_10H, 3))).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
      "2026-10-19T09:00:00.000Z",
    ]);
    const atNine = new Date("2026-10-03T09:00:00Z");
    expect(parse("0 9 * * *").nextRun(atNine)?.toISOString()).toBe("2026-10-04T09:00:00.000Z");
  });

  it("combines day-of-month and day-of-week with OR, like cron", () => {
    expect(iso(parse("0 9 15 * 1").nextRuns(SATURDAY_10H, 3))).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
      "2026-10-15T09:00:00.000Z",
    ]);
  });

  it("finds the latest occurrence at or before a moment, the moment itself included", () => {
    const daily = parse("0 9 * * *");
    expect(daily.latestRun(SATURDAY_10H)?.toISOString()).toBe("2026-10-03T09:00:00.000Z");
    expect(daily.latestRun(new Date("2026-10-03T09:00:00Z"))?.toISOString()).toBe(
      "2026-10-03T09:00:00.000Z",
    );
    expect(daily.latestRun(new Date("2026-10-03T08:59:59.900Z"))?.toISOString()).toBe(
      "2026-10-02T09:00:00.000Z",
    );
  });

  it("treats an expression that never fires as having no occurrence at all", () => {
    const never = parse("0 9 31 2 *");
    expect(never.nextRun(SATURDAY_10H)).toBeNull();
    expect(never.latestRun(SATURDAY_10H)).toBeNull();
  });

  it("measures the smallest gap between upcoming occurrences", () => {
    expect(parse("*/20 * * * *").minGapMinutes(SATURDAY_10H, 24)).toBe(20);
    expect(parse("0 9,10 * * 1").minGapMinutes(SATURDAY_10H, 24)).toBe(60);
    expect(parse("0 9 31 2 *").minGapMinutes(SATURDAY_10H, 24)).toBe(Infinity);
  });

  it("refuses anything but five fields, with a French reason", () => {
    for (const expression of ["0 0 * * * *", "* * *", "abc"]) {
      expect(CronExpression.tryParse(expression)).toEqual({
        ok: false,
        reason: "5 champs attendus : minute heure jour-du-mois mois jour-de-la-semaine",
      });
    }
  });

  it("names the field holding an invalid value", () => {
    expect(CronExpression.tryParse("60 9 * * *")).toEqual({
      ok: false,
      reason: "valeur invalide pour les minutes : 60",
    });
    expect(CronExpression.tryParse("0 9 * * 8")).toEqual({
      ok: false,
      reason: "valeur invalide pour le jour de la semaine : 8",
    });
  });

  it("falls back to a generic reason for other syntax errors", () => {
    expect(CronExpression.tryParse("5/5 * * * *")).toEqual({
      ok: false,
      reason: "expression cron invalide",
    });
  });
});

describe("CronExpression across a DST change", () => {
  it("moves a local time skipped by spring-forward to the next valid minute", () => {
    const previous = process.env["TZ"];
    process.env["TZ"] = "Europe/Paris";
    try {
      const runs = parse("30 2 * * *").nextRuns(new Date("2026-03-28T12:00:00+01:00"), 2);
      // 02:30 does not exist on 2026-03-29 in Paris: it runs at 03:30 (01:30 UTC).
      expect(iso(runs)).toEqual(["2026-03-29T01:30:00.000Z", "2026-03-30T00:30:00.000Z"]);
    } finally {
      if (previous === undefined) delete process.env["TZ"];
      else process.env["TZ"] = previous;
    }
  });
});

describe("upcomingRuns", () => {
  it("previews the next occurrences of a recurrence, none for an invalid one", () => {
    const weekly = { kind: "weekly", weekday: 1, at: { hour: 9, minute: 0 } } as const;
    expect(iso(upcomingRuns(weekly, SATURDAY_10H, 2))).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
    ]);
    expect(upcomingRuns({ kind: "cron", expression: "nope" }, SATURDAY_10H, 2)).toEqual([]);
  });
});

describe("parseTimeOfDay", () => {
  it("reads a 24-hour HH:MM or H:MM time, nothing else", () => {
    expect(parseTimeOfDay("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTimeOfDay(" 7:30 ")).toEqual({ hour: 7, minute: 30 });
    expect(parseTimeOfDay("23:59")).toEqual({ hour: 23, minute: 59 });
    for (const text of ["24:00", "12:60", "9h", "09:5", "", "-1:00"]) {
      expect(parseTimeOfDay(text), text).toBeNull();
    }
  });
});

describe("parseMonthDay", () => {
  it("reads a day every month has, or the last one", () => {
    expect(parseMonthDay("1")).toBe(1);
    expect(parseMonthDay(" 28 ")).toBe(28);
    expect(parseMonthDay("Dernier")).toBe("last");
    expect(parseMonthDay("last")).toBe("last");
    for (const text of ["0", "29", "31", "01", "lundi", ""]) {
      expect(parseMonthDay(text), text).toBeNull();
    }
  });
});
