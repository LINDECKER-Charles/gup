import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import { OptionsPanel } from "../../../src/ui/panels/options-panel.js";
import type { KeyPress } from "../../../src/ui/tui/screen-host.js";

const key = (name: string): KeyPress => ({ name, sequence: name, ctrl: false });
const text = (lines: readonly (readonly { text: string }[])[]) =>
  lines.map((l) => l.map((s) => s.text).join("")).join("\n");
const VIEW = { width: 100, height: 20 };

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
