import { describe, expect, it } from "vitest";
import { selectionBar, type SelectionBarState } from "../../../src/ui/panels/selection-bar.js";
import { LAUNCH_NOTICES, SELECTION_BAR } from "../../../src/ui/text/packages-labels.js";
import type { Line } from "../../../src/ui/tui/styled-lines.js";

const text = (line: Line) => line.map((segment) => segment.text).join("");
const WIDTH = 70;

function bar(state: Partial<SelectionBarState> = {}): Line[] {
  return selectionBar({ checked: 0, total: 9, canLaunch: true, notice: null, ...state }, WIDTH);
}

describe("selectionBar", () => {
  it("says how to check packages while none is, with no button", () => {
    const [spacer, row] = bar();
    expect(spacer).toEqual([]);
    expect(text(row!)).toBe(SELECTION_BAR.empty);
    const narrow = selectionBar({ checked: 0, total: 9, canLaunch: true, notice: null }, 40);
    expect(text(narrow.at(-1)!)).toBe(SELECTION_BAR.emptyShort);
  });

  it("counts the checked packages and puts the launch button at the right edge", () => {
    const row = bar({ checked: 2 }).at(-1)!;
    expect(text(row)).toHaveLength(WIDTH);
    expect(text(row)).toMatch(/^● 2 sur 9 coché\(s\) +▐ Entrée {2}Mettre à jour \(2\) ▌$/);
    const button = row.find((segment) => segment.text === SELECTION_BAR.button(2));
    expect(button).toMatchObject({ tone: "onAccent", fill: "accent" });
  });

  it("draws the button inert while it cannot be pressed", () => {
    const row = bar({ checked: 2, canLaunch: false }).at(-1)!;
    expect(text(row)).toContain(SELECTION_BAR.button(2));
    expect(row.at(-1)).toEqual({ text: expect.stringContaining("Entrée"), tone: "disabled" });
  });

  it("shows a notice above the bar, wrapped to the width", () => {
    const lines = selectionBar(
      { checked: 0, total: 9, canLaunch: true, notice: LAUNCH_NOTICES.empty },
      30,
    );
    expect(lines.length).toBeGreaterThan(2);
    const notice = lines.slice(0, -1);
    expect(notice.map(text).join(" ")).toBe(LAUNCH_NOTICES.empty);
    expect(notice.every((line) => line.every((segment) => segment.tone === "warning"))).toBe(true);
  });
});
