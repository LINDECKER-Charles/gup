import { describe, expect, it } from "vitest";
import { chartGlyphs } from "../../../src/ui/charts/chart-glyphs.js";
import { renderHeatmap, type HeatmapInput } from "../../../src/ui/charts/heatmap.js";
import { MONTH_ABBREVIATIONS } from "../../../src/ui/text/activity-labels.js";
import type { Line } from "../../../src/ui/tui/styled-lines.js";

const text = (line: Line) => line.map((segment) => segment.text).join("");

/** End on Saturday 3 October 2026: its week runs Monday 28 Sept. → Sunday 4 Oct. */
function heatmap(over: Partial<HeatmapInput> = {}): Line[] {
  return renderHeatmap({
    counts: new Map([
      ["2026-09-28", 1],
      ["2026-09-29", 2],
      ["2026-09-30", 3],
      ["2026-10-01", 4],
    ]),
    end: "2026-10-03",
    maxWeeks: 3,
    width: 40,
    glyphs: chartGlyphs("unicode"),
    ...over,
  });
}

describe("renderHeatmap", () => {
  it("draws a month row, seven weekday rows from Monday and a legend", () => {
    const lines = heatmap().map((line) => text(line).trimEnd());

    expect(lines).toEqual([
      "        oct.",
      "lun · · ░",
      "    · · ▒",
      "mer · · ▓",
      "    · · █",
      "ven · · ·",
      "    · · ·",
      "dim · ·",
      "moins · ░ ▒ ▓ █ plus",
    ]);
  });

  it("leaves the days after the end blank, and tones days without activity muted", () => {
    const sunday = heatmap()[7]!;

    expect(text(sunday)).toBe("dim · ·   ");
    const ofMark = (mark: string) => heatmap()[1]!.find((segment) => segment.text.includes(mark))?.tone;
    expect(ofMark("·")).toBe("muted");
    expect(ofMark("░")).toBe("success");
  });

  it("narrows its cells to one column when the wanted weeks do not fit two", () => {
    const lines = heatmap({ maxWeeks: 53, width: 50 });

    expect(text(lines[1]!)).toHaveLength(4 + 46);
    expect(text(lines[1]!).endsWith("░")).toBe(true);
  });

  it("names each month once over the week of its 1st, never two names touching", () => {
    const monthRow = text(heatmap({ maxWeeks: 53, width: 50, counts: new Map() })[0]!);
    const names = monthRow.trim().split(/\s+/);

    // The window runs from mid-November 2025 to October 2026: unroll the year.
    const unrolled = names.map((name) => {
      const month = MONTH_ABBREVIATIONS.indexOf(name as (typeof MONTH_ABBREVIATIONS)[number]);
      expect(month, `${name} is a month`).not.toBe(-1);
      return month >= 10 ? month : month + 12;
    });
    expect(names.length).toBeGreaterThan(3);
    expect(unrolled).toEqual([...new Set(unrolled)].sort((a, b) => a - b));
  });

  it("draws with the ASCII set", () => {
    const lines = heatmap({ glyphs: chartGlyphs("ascii") }).map((line) => text(line).trimEnd());

    expect(lines.slice(1, 5)).toEqual(["lun . . :", "    . . +", "mer . . *", "    . . #"]);
    expect(lines.at(-1)).toBe("moins . : + * # plus");
  });
});
