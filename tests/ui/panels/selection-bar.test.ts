import { describe, expect, it } from "vitest";
import { selectionBar, type SelectionBarState } from "../../../src/ui/panels/selection-bar.js";
import { LAUNCH_NOTICES, SELECTION_BAR } from "../../../src/ui/text/packages-labels.js";
import type { Line } from "../../../src/ui/tui/styled-lines.js";
import { useLocale } from "../../support/locale.js";

const text = (line: Line) => line.map((segment) => segment.text).join("");
const WIDTH = 70;
/** Paquets' width on an 80-column terminal. */
const NARROW = 50;

function bar(state: Partial<SelectionBarState> = {}, width = WIDTH): Line[] {
  return selectionBar({ checked: 0, total: 9, canLaunch: true, notice: null, ...state }, width);
}

describe("selectionBar", () => {
  it("says how to check packages while none is, with no button", () => {
    const [spacer, row] = bar();
    expect(spacer).toEqual([]);
    expect(text(row!)).toBe(SELECTION_BAR.empty);
  });

  it("keeps saying how to check on a narrow bar, on the row above it", () => {
    expect(bar({}, NARROW).map(text)).toEqual([
      SELECTION_BAR.howToCheck,
      SELECTION_BAR.nothingChecked,
    ]);
  });

  it("counts the checked packages and puts the launch button at the right edge", () => {
    const row = bar({ checked: 2 }).at(-1)!;
    expect(text(row)).toHaveLength(WIDTH);
    expect(text(row)).toMatch(/^● 2 sur 9 coché\(s\) +▐ Entrée {2}Mettre à jour \(2\) ▌$/);
    const button = row.find((segment) => segment.text === SELECTION_BAR.button(2));
    expect(button).toMatchObject({ tone: "onAccent", fill: "accent" });
  });

  it("drops the number from a narrow bar's button rather than cut the count", () => {
    const row = text(bar({ checked: 15, total: 19 }, NARROW).at(-1)!);
    expect(row).toHaveLength(NARROW);
    expect(row).toMatch(/^● 15 sur 19 coché\(s\) +▐ Entrée {2}Mettre à jour ▌$/);
  });

  it("cuts the count when even that does not fit, never letting it touch the button", () => {
    const row = text(bar({ checked: 2 }, 36).at(-1)!);
    expect(row).toHaveLength(36);
    expect(row).toMatch(/^● 2 sur 9… ▐ Entrée {2}Mettre à jour ▌$/);
  });

  it("draws the button inert while it cannot be pressed", () => {
    const row = bar({ checked: 2, canLaunch: false }).at(-1)!;
    expect(text(row)).toContain(SELECTION_BAR.button(2));
    expect(row.at(-1)).toEqual({ text: expect.stringContaining("Entrée"), tone: "disabled" });
  });

  it("shows a notice above the bar, wrapped to the width", () => {
    const lines = bar({ notice: LAUNCH_NOTICES.empty }, 30);
    expect(lines.length).toBeGreaterThan(2);
    const notice = lines.slice(0, -1);
    expect(notice.map(text).join(" ")).toBe(LAUNCH_NOTICES.empty);
    expect(notice.every((line) => line.every((segment) => segment.tone === "warning"))).toBe(true);
    expect(text(lines.at(-1)!)).toBe(SELECTION_BAR.nothingChecked);
  });
});

describe("selectionBar in English", () => {
  useLocale("en");

  it("says how to check, on the row above when the bar is narrow", () => {
    expect(text(bar().at(-1)!)).toBe("No package checked — space to check, a to check all");
    expect(bar({}, NARROW).map(text)).toEqual([
      "space to check, a to check all",
      "No package checked",
    ]);
  });

  it("counts the checked packages beside the launch button", () => {
    expect(text(bar({ checked: 2 }).at(-1)!)).toMatch(
      /^● 2 of 9 checked +▐ Enter {2}Update \(2\) ▌$/,
    );
    expect(text(bar({ checked: 1284, total: 2000 }).at(-1)!)).toMatch(
      /^● 1,284 of 2,000 checked +▐ Enter {2}Update \(1,284\) ▌$/,
    );
  });
});
