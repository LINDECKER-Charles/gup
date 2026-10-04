import { describe, expect, it, vi } from "vitest";
import { SIDEBAR_WIDTH } from "../../../src/ui/app/sidebar.js";
import { ScanPanel } from "../../../src/ui/panels/scan-panel.js";
import { STATUS_GLYPHS } from "../../../src/ui/theme/glyphs.js";
import type { KeyPress } from "../../../src/ui/tui/screen-host.js";
import { panelFrame } from "../../../src/ui/tui/text-panel.js";

const key = (name: string): KeyPress => ({ name, sequence: name, ctrl: false });
const text = (lines: readonly (readonly { text: string }[])[]) =>
  lines.map((l) => l.map((s) => s.text).join("")).join("\n");
const VIEW = { width: 100, height: 20 };

describe("ScanPanel", () => {
  it("shows progress, then the result per provider with failures first", () => {
    const scan = new ScanPanel(vi.fn());
    scan.detecting();
    expect(text(scan.render(VIEW))).toContain("détection des providers");
    scan.planned(3);
    scan.started("Winget");
    scan.started("Azure CLI");
    scan.finished("Azure CLI", { updates: 0, ms: 600, error: "exit 1" });
    expect(text(scan.render(VIEW))).toContain("scan 1/3");
    scan.finished("Winget", { updates: 3, ms: 2100 });
    scan.completed(2900);
    const out = text(scan.render(VIEW));
    expect(out).toContain("Scan terminé en 2,9 s — 3 provider(s), 3 mise(s) à jour");
    expect(out.indexOf("Azure CLI")).toBeLessThan(out.indexOf("Winget"));
    expect(out).toMatch(/Winget +3 mise\(s\) à jour +2,1 s/);
  });

  it("writes durations the French way, the time column aligned past a minute", () => {
    const scan = new ScanPanel(vi.fn());
    scan.detecting();
    scan.planned(2);
    scan.finished("Winget", { updates: 1, ms: 600 });
    scan.finished("Scoop", { updates: 0, ms: 65_000 });
    scan.completed(65_400);
    const lines = text(scan.render(VIEW)).split("\n");
    expect(lines[0]).toContain("Scan terminé en 1 min 05 s");
    const rows = lines.filter((line) => /Winget|Scoop/.test(line));
    expect(rows.map((row) => row.trimEnd().split(/ {2,}/).at(-1))).toEqual(["0,6 s", "1 min 05 s"]);
    expect(new Set(rows.map((row) => row.trimEnd().length)).size).toBe(1);
  });

  it("wraps the summary and a failure's reason on an 80-column terminal", () => {
    const narrow = { width: 52, height: 20 };
    // The headline's rows: everything above the blank line under it.
    const summaryOf = (scan: ScanPanel) => {
      const lines = text(scan.render(narrow)).split("\n");
      return lines.slice(0, lines.indexOf(""));
    };
    const scan = new ScanPanel(vi.fn());
    scan.detecting();
    scan.planned(12);
    scan.completed(1200);
    const summary = summaryOf(scan);
    expect(summary.length).toBeGreaterThan(1);
    expect(summary.every((line) => line.length <= narrow.width)).toBe(true);
    expect(summary.join(" ")).toBe("√ Scan terminé en 1,2 s — 12 provider(s), 0 mise(s) à jour");

    const reason = "la détection des providers a dépassé son délai (30 s)";
    scan.failed(reason);
    expect(summaryOf(scan).join(" ")).toBe(`× Scan interrompu : ${reason}`);
  });

  it("keeps every provider's duration inside the panel on an 80-column terminal", () => {
    const width = 80 - SIDEBAR_WIDTH - panelFrame("comfortable").cols;
    const scan = new ScanPanel(vi.fn());
    scan.detecting();
    scan.planned(3);
    scan.finished("ProjectDiscovery tool manager", { updates: 12, ms: 65_000 });
    scan.finished("Azure CLI", { updates: 0, ms: 900, error: "az upgrade a échoué : code 1" });
    scan.finished("Winget", { updates: 0, ms: 600 });
    scan.started("Scoop");
    const rows = text(scan.render({ width, height: 20 }))
      .split("\n")
      .filter((line) => /^ {2}\S /.test(line));
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.length <= width)).toBe(true);
    expect(rows.map((row) => row.trimEnd().split(/ {2,}/).at(-1))).toEqual([
      "en cours…",
      "0,9 s",
      "1 min 05 s",
      "0,6 s",
    ]);
    // The name is cut before the result, and the result before the duration.
    expect(rows[2]).toMatch(/ ProjectDiscover… 12 mise\(s\) à jour +1 min 05 s$/);
  });

  it("turns the spinner on every tick, on the headline and on each running provider", () => {
    const scan = new ScanPanel(vi.fn());
    scan.detecting();
    scan.planned(2);
    scan.started("Winget");
    scan.started("Scoop");
    const marks = () =>
      text(scan.render(VIEW))
        .split("\n")
        .filter((line) => / scan |en cours/.test(line))
        .map((line) => line.trim().charAt(0));
    const seen = STATUS_GLYPHS.running.map(() => {
      const frame = marks();
      scan.tick();
      return frame;
    });
    expect(seen).toEqual(STATUS_GLYPHS.running.map((glyph) => [glyph, glyph, glyph]));
    expect(marks()).toEqual(seen[0]);
  });

  it("rescans on r, but not while a scan runs", () => {
    const onRescan = vi.fn();
    const scan = new ScanPanel(onRescan);
    scan.detecting();
    scan.press(key("r"));
    expect(onRescan).not.toHaveBeenCalled();
    scan.completed(10);
    scan.press(key("r"));
    expect(onRescan).toHaveBeenCalledOnce();
  });
});
