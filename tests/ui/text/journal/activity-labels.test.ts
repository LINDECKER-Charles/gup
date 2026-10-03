import { describe, expect, it } from "vitest";
import { parsePeriod, parseUntil, withUntil } from "../../../../src/core/time/period.js";
import { periodLead } from "../../../../src/ui/text/journal/activity-labels.js";

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
