import { describe, expect, it } from "vitest";
import { menuViews } from "../../src/commands/menu-views.js";
import { sidebarEntries } from "../../src/ui/app/sidebar.js";

describe("menuViews", () => {
  it("registers each view once, in id order, so features add their line without conflicts", () => {
    const ids = menuViews().map((view) => view.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("puts the work views first, then information and settings, then Quitter", () => {
    const sidebar = sidebarEntries(menuViews()).map(({ label, group }) => [label, group]);
    expect(sidebar).toEqual([
      ["Scan", 0],
      ["Paquets", 0],
      ["Planification", 0],
      ["Providers", 1],
      ["Journal", 1],
      ["Options", 1],
      ["Quitter", 2],
    ]);
  });
});
