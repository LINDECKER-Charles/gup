import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import { OptionsPanel } from "../../../src/ui/panels/options-panel.js";
import { ProvidersPanel } from "../../../src/ui/panels/providers-panel.js";
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
    expect(out).toContain("Scan terminé en 2.9s — 3 provider(s), 3 mise(s) à jour");
    expect(out.indexOf("Azure CLI")).toBeLessThan(out.indexOf("Winget"));
    expect(out).toMatch(/Winget +3 mise\(s\) à jour +2\.1s/);
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

describe("ProvidersPanel", () => {
  it("lists detected providers, then missing ones with their install hint", () => {
    const panel = new ProvidersPanel();
    panel.setData(
      [{ id: "winget", displayName: "Winget" }],
      [{ id: "brew", displayName: "Homebrew", installHint: "https://brew.sh" }],
    );
    const out = text(panel.render(VIEW));
    expect(out).toContain("Détectés (1)");
    expect(out).toContain("Non installés / hors PATH (1)");
    expect(out).toContain("→ https://brew.sh");
  });
});

describe("OptionsPanel", () => {
  const state = (): MenuState => ({
    scans: [],
    fast: false,
    filter: [],
    detectedCount: 2,
    providers: [
      { id: "winget", displayName: "Winget" },
      { id: "pip", displayName: "pip" },
    ],
  });

  it("toggles fast mode and offers a rescan", () => {
    const onRescan = vi.fn();
    const s = state();
    const panel = new OptionsPanel(s, { onEditTimeout: vi.fn(), onRescan });
    panel.press(key("return"));
    expect(s.fast).toBe(true);
    expect(text(panel.render(VIEW))).toContain("r pour rescanner");
    panel.press(key("r"));
    expect(onRescan).toHaveBeenCalledOnce();
  });

  it("asks for the timeout through the handler", () => {
    const onEditTimeout = vi.fn();
    const panel = new OptionsPanel(state(), { onEditTimeout, onRescan: vi.fn() });
    panel.press(key("down"));
    panel.press(key("return"));
    expect(onEditTimeout).toHaveBeenCalledOnce();
  });

  it("edits the provider filter in place", () => {
    const s = state();
    const panel = new OptionsPanel(s, { onEditTimeout: vi.fn(), onRescan: vi.fn() });
    for (const k of ["down", "down", "return", "down", "space"]) panel.press(key(k));
    expect(s.filter).toEqual(["pip"]);
    expect(text(panel.render(VIEW))).toContain("Providers à inclure");
    panel.press(key("escape"));
    expect(text(panel.render(VIEW))).toContain("[1 choisi(s)]");
  });
});
