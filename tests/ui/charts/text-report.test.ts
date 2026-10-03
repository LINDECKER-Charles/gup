import { describe, expect, it } from "vitest";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { linesToAnsi, linesToText } from "../../../src/ui/charts/ansi-lines.js";
import { chartGlyphs } from "../../../src/ui/charts/chart-glyphs.js";
import { renderTextReport } from "../../../src/ui/charts/text-report.js";
import { EMPTY_ACTIVITY, TEXT_REPORT_LABELS } from "../../../src/ui/text/journal/activity-labels.js";
import { seg } from "../../../src/ui/tui/styled-lines.js";
import { updateEvent } from "../../support/history-fixtures.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const PERIOD = parsePeriod("90d", NOW)!;

function report(events: readonly HistoryEvent[], width = 100): string {
  const insights = buildInsights(events, { period: PERIOD });
  return linesToText(renderTextReport(insights, { width, glyphs: chartGlyphs("unicode"), now: NOW }), "unicode");
}

const day = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

describe("renderTextReport", () => {
  it("titles the report with its period and says so when nothing happened", () => {
    expect(report([])).toBe(`gup — activité · 90 derniers jours\n\n${EMPTY_ACTIVITY}\n`);
  });

  it("follows the summary with the most updated packages and the recurring failures", () => {
    const text = report([
      updateEvent("winget", "Google.Chrome", { ts: day(16) }),
      updateEvent("winget", "Google.Chrome", { ts: day(9) }),
      updateEvent("winget", "Google.Chrome", { ts: day(2) }),
      updateEvent("npm-g", "typescript", { ts: day(5) }),
      updateEvent("choco", "nodejs", { ts: day(4), status: "failed", message: "exit code 1603\nlog: C:\\x" }),
      updateEvent("choco", "nodejs", { ts: day(3), status: "failed", message: "exit code 1603" }),
    ]);

    expect(text).toContain("4 mises à jour · 67 % réussies · 2 paquets · 2 échecs");
    expect(text).toContain(`${TEXT_REPORT_LABELS.topPackages}\n`);
    expect(text).toMatch(/ {2}Google\.Chrome +winget +█+ +3 +~7 j hebdo\./);
    expect(text).toMatch(/ {2}typescript +npm-g +[█▍]+ +1 +— une fois/);
    expect(text).toContain(`${TEXT_REPORT_LABELS.failures}\n  2× choco · nodejs — exit code 1603\n`);
  });

  it("drops the pace columns of the package table on a narrow terminal", () => {
    const text = report([updateEvent("winget", "Git.Git", { ts: day(2) })], 60);

    expect(text).toMatch(/ {2}Git\.Git +winget +█+ +1\n/);
  });
});

describe("terminal output", () => {
  it("translates every symbol in ASCII mode, as the full screen does", () => {
    const lines = [[seg("→ ✔ ", "success"), seg("██▍ · ", "accent")]];

    expect(linesToText(lines, "ascii")).toBe("> + ### .\n");
    expect(linesToText(lines, "unicode")).toBe("→ ✔ ██▍ ·\n");
  });

  it("keeps the text of every line when painting it", () => {
    const painted = linesToAnsi([[seg("a", "danger"), seg("b", "muted")], []], "unicode");

    expect(painted.replace(/\u001b\[\d+m/g, "")).toBe("ab\n\n");
  });
});
