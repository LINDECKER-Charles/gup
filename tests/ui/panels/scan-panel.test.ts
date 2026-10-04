import { describe, expect, it, vi } from "vitest";
import { ScanPanel } from "../../../src/ui/panels/scan-panel.js";
import type { KeyPress } from "../../../src/ui/tui/screen-host.js";

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
