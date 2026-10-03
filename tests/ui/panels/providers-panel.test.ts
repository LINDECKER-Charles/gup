import { describe, expect, it, vi } from "vitest";
import { ProvidersPanel } from "../../../src/ui/panels/providers-panel.js";

const text = (lines: readonly (readonly { text: string }[])[]) =>
  lines.map((l) => l.map((s) => s.text).join("")).join("\n");
const VIEW = { width: 100, height: 20 };

describe("ProvidersPanel", () => {
  it("lists detected providers, then missing ones with their install hint", () => {
    const panel = new ProvidersPanel(vi.fn());
    panel.setData(
      [{ id: "winget", displayName: "Winget" }],
      [{ id: "brew", displayName: "Homebrew", installHint: "https://brew.sh" }],
    );
    const out = text(panel.render(VIEW));
    expect(out).toContain("Détectés (1)");
    expect(out).toContain("Non installés / hors PATH (1)");
    expect(out).toContain("→ https://brew.sh");
  });

  it("starts loading the first time it is shown, and only then", () => {
    const load = vi.fn();
    const panel = new ProvidersPanel(load);
    expect(text(panel.render(VIEW))).toContain("détection des providers");
    panel.onShow();
    panel.onShow();
    expect(load).toHaveBeenCalledOnce();
  });
});
