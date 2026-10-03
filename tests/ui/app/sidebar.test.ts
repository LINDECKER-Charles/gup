import { describe, expect, it, vi } from "vitest";
import {
  entryAtRow,
  renderSidebar,
  sidebarEntries,
  type SidebarLayout,
} from "../../../src/ui/app/sidebar.js";
import type { ViewDefinition, ViewId } from "../../../src/ui/app/view-definition.js";

const text = (lines: readonly (readonly { text: string }[])[]) =>
  lines.map((l) => l.map((s) => s.text).join("").trimEnd());

function view(id: ViewId, group: 0 | 1, order: number): ViewDefinition {
  return { id, label: id, group, order, create: vi.fn() };
}

const VIEWS = [
  view("options", 1, 60),
  view("scan", 0, 10),
  view("providers", 1, 40),
  view("packages", 0, 20),
];
const STATE = { current: "scan" as const, cursor: 0, isFocused: false };

describe("sidebar", () => {
  it("lists the views by group then order, Quitter last", () => {
    expect(sidebarEntries(VIEWS).map((entry) => entry.id)).toEqual([
      "scan",
      "packages",
      "providers",
      "options",
      "quit",
    ]);
  });

  it("separates the groups with a blank row, and maps clicks around it", () => {
    const layout: SidebarLayout = { entries: sidebarEntries(VIEWS), density: "comfortable" };
    expect(text(renderSidebar(layout, STATE, 22))).toEqual([
      "▌ scan",
      "  packages",
      "",
      "  providers",
      "  options",
      "",
      "  Quitter",
    ]);
    expect([0, 1, 2, 3, 6].map((row) => entryAtRow(layout, row))).toEqual([0, 1, null, 2, 4]);
  });

  it("drops the separators when compact", () => {
    const layout: SidebarLayout = { entries: sidebarEntries(VIEWS), density: "compact" };
    expect(text(renderSidebar(layout, STATE, 22))).toHaveLength(5);
    expect(entryAtRow(layout, 4)).toBe(4);
  });
});
