import { describe, expect, it } from "vitest";
import { parsePeriod, parseUntil, withUntil } from "../../../../src/core/time/period.js";
import { periodLabel, periodLead } from "../../../../src/ui/text/journal/activity-labels.js";
import { useLocale } from "../../../support/locale.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");

describe("periodLead", () => {
  it.each([
    ["12m", "Sur les 12 derniers mois"],
    ["30d", "Sur les 30 derniers jours"],
    ["1m", "Sur le dernier mois"],
    ["1y", "Sur la dernière année"],
    ["all", "Sur tout l'historique"],
    ["2026-01-01", "Depuis le 01/01/2026"],
  ])("opens a sentence with the period %s", (key, lead) => {
    expect(periodLead(parsePeriod(key, NOW)!)).toBe(lead);
  });

  it("names the end of a period given one", () => {
    const period = withUntil(parsePeriod("2026-01-01", NOW)!, parseUntil("2026-03-31")!)!;

    expect(periodLead(period)).toBe("Depuis le 01/01/2026 jusqu'au 31/03/2026");
  });
});

describe("the period in English", () => {
  useLocale("en");

  it.each([
    ["12m", "past 12 months", "Over the past 12 months"],
    ["1w", "past week", "Over the past week"],
    ["all", "all history", "Across all history"],
    ["2026-01-01", "since 2026-01-01", "Since 2026-01-01"],
  ])("words %s as a label and as a sentence's opening", (key, label, lead) => {
    const period = parsePeriod(key, NOW)!;

    expect(periodLabel(period)).toBe(label);
    expect(periodLead(period)).toBe(lead);
  });

  it("names the end of a period given one", () => {
    const period = withUntil(parsePeriod("30d", NOW)!, parseUntil("2026-09-30")!)!;

    expect(periodLabel(period)).toBe("past 30 days until 2026-09-30");
  });

  it("words a period between two dates from one to the other", () => {
    const period = withUntil(parsePeriod("2026-01-01", NOW)!, parseUntil("2026-03-31")!)!;

    expect(periodLabel(period)).toBe("from 2026-01-01 to 2026-03-31");
    expect(periodLead(period)).toBe("From 2026-01-01 to 2026-03-31");
  });
});
