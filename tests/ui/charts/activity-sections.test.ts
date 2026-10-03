import { describe, expect, it } from "vitest";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import {
  heatmapSection,
  kpiLines,
  slowProvidersLine,
  trendLine,
  type ChartContext,
} from "../../../src/ui/charts/activity-sections.js";
import { chartGlyphs } from "../../../src/ui/charts/chart-glyphs.js";
import { HEATMAP_LABELS, NO_DATA } from "../../../src/ui/text/activity-labels.js";
import type { Line } from "../../../src/ui/tui/styled-lines.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";

// TZ=UTC in the test environment: local days are UTC days.
const NOW = new Date("2026-10-03T12:00:00.000Z");
const text = (line: Line) => line.map((segment) => segment.text).join("");

function context(width: number): ChartContext {
  return { width, glyphs: chartGlyphs("unicode"), now: NOW };
}

function insights(events: readonly HistoryEvent[], period = "12m") {
  return buildInsights(events, { period: parsePeriod(period, NOW)! });
}

const ACTIVITY: HistoryEvent[] = [
  ...Array.from({ length: 33 }, (_unused, index) =>
    updateEvent("winget", `pkg-${index % 5}`, {
      ts: new Date(NOW.getTime() - (index + 1) * 86_400_000).toISOString(),
    }),
  ),
  updateEvent("choco", "nodejs", { ts: "2026-09-30T10:00:00.000Z", status: "failed" }),
  scanEvent({
    ts: "2026-10-01T09:00:00.000Z",
    outdated: 23,
    providers: [
      { providerId: "winget", outdated: 20, durationMs: 12_400 },
      { providerId: "choco", outdated: 3, durationMs: 4_200 },
      { providerId: "pwsh-modules", outdated: 0, durationMs: 9_100 },
      { providerId: "pip", outdated: 0, durationMs: 300 },
    ],
  }),
  scanEvent({ ts: "2026-10-03T09:00:00.000Z", outdated: 7 }),
];

describe("kpiLines", () => {
  it("states the period's numbers in French, then how recent the last update and scan are", () => {
    const lines = kpiLines(insights(ACTIVITY), context(120)).map(text);

    expect(lines).toEqual([
      "33 mises à jour · 97 % réussies · 5 paquets · 1 échec · 0 ignorée · 2 scans",
      "dernière mise à jour hier 12:00 · dernier scan il y a 3 h · 7 paquets en retard",
    ]);
  });

  it("wraps between items on a narrow panel", () => {
    const lines = kpiLines(insights(ACTIVITY), context(50)).map(text);

    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(50);
    expect(lines.join(" · ")).toContain("1 échec · 0 ignorée");
  });

  it("says when nothing was updated nor scanned, without a success rate", () => {
    const lines = kpiLines(insights([]), context(120)).map(text);

    expect(lines).toEqual([
      "0 mise à jour · 0 paquet · 0 échec · 0 ignorée · 0 scan",
      "aucune mise à jour réussie · aucun scan",
    ]);
  });
});

describe("heatmapSection", () => {
  it("titles the heatmap and covers the period's weeks, a year at most", () => {
    const month = heatmapSection(insights(ACTIVITY, "30d"), context(120));
    const year = heatmapSection(insights(ACTIVITY, "all"), context(120));

    expect(text(month[0]!)).toBe(HEATMAP_LABELS.title);
    expect(text(month[2]!)).toHaveLength(4 + 5 * 2);
    expect(text(year[2]!)).toHaveLength(4 + 53 * 2);
  });
});

describe("trendLine", () => {
  it("draws the outdated count of each day, carried over days without a full scan", () => {
    const line = trendLine(insights(ACTIVITY), context(80));

    expect(text(line)).toBe("Paquets en retard (scans complets)  ██▃  max 23 · actuel 7");
  });

  it("shortens its title on a narrow panel and shows a dash without data", () => {
    expect(text(trendLine(insights(ACTIVITY), context(50)))).toMatch(/^En retard {2}\S+ {2}max 23 · actuel 7$/);
    expect(text(trendLine(insights([]), context(80)))).toBe(`Paquets en retard (scans complets)  ${NO_DATA}`);
  });
});

describe("slowProvidersLine", () => {
  it("names the three providers whose own scan is the slowest", () => {
    expect(text(slowProvidersLine(insights(ACTIVITY), context(100)))).toBe(
      "Scans les plus lents  winget 12,4 s · pwsh-modules 9,1 s · choco 4,2 s",
    );
  });

  it("shows a dash until a scan measured a provider", () => {
    expect(text(slowProvidersLine(insights([scanEvent()]), context(100)))).toBe(`Scans les plus lents  ${NO_DATA}`);
  });
});
