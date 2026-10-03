import { describe, expect, it } from "vitest";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { PackageList } from "../../../src/ui/panels/package-list.js";

const pkg = (id: string) => ({ id, current: "1", latest: "2" });
const SCANS: ProviderScanResult[] = [
  { providerId: "winget", available: true, packages: [pkg("Git.Git"), pkg("7zip.7zip")] },
  { providerId: "npm-g", available: true, packages: [pkg("typescript")] },
  { providerId: "pip", available: true, packages: [] },
  { providerId: "az", available: true, packages: [], error: "exit 1" },
];
const NAMES: Record<string, string> = { winget: "Winget", "npm-g": "npm (global)", az: "Azure CLI" };
const make = () => new PackageList(SCANS, (id) => NAMES[id] ?? id);
const ids = (list: PackageList) => list.selection.map((s) => s.pkg.id);

describe("PackageList", () => {
  it("groups by provider name, skips providers with nothing to show, keeps failures", () => {
    const rows = make().rows.map((r) => (r.kind === "package" ? r.pkg.id : `${r.kind}:${r.title}`));
    expect(rows).toEqual([
      "failure:Azure CLI",
      "group:npm (global)",
      "typescript",
      "group:Winget",
      "Git.Git",
      "7zip.7zip",
    ]);
    expect(make().total).toBe(3);
  });

  it("toggles the package under the cursor", () => {
    const list = make();
    list.moveTo(4);
    list.toggleCurrent();
    expect(ids(list)).toEqual(["Git.Git"]);
    list.toggleCurrent();
    expect(ids(list)).toEqual([]);
  });

  it("checks a whole group from its header, then clears it", () => {
    const list = make();
    list.moveTo(3);
    list.toggleCurrent();
    expect(ids(list)).toEqual(["Git.Git", "7zip.7zip"]);
    expect(list.groupState("winget")).toEqual({ checked: 2, total: 2 });
    list.toggleCurrent();
    expect(ids(list)).toEqual([]);
  });

  it("filters by package or provider, and keeps checked packages through the filter", () => {
    const list = make();
    list.moveTo(2);
    list.toggleCurrent();
    list.setFilter("7zip");
    expect(list.rows.map((r) => r.kind)).toEqual(["group", "package"]);
    list.toggleAllVisible();
    expect(ids(list)).toEqual(["typescript", "7zip.7zip"]);
    list.setFilter("winget");
    expect(list.rows).toHaveLength(3);
  });

  it("offers what is under the cursor when nothing is checked", () => {
    const list = make();
    list.moveTo(5);
    expect(list.underCursor.map((s) => s.pkg.id)).toEqual(["7zip.7zip"]);
    list.moveTo(3);
    expect(list.underCursor.map((s) => s.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
    list.moveTo(0);
    expect(list.underCursor).toEqual([]);
  });

  it("keeps the cursor inside the list", () => {
    const list = make();
    list.move(-5);
    expect(list.cursor).toBe(0);
    list.move(50);
    expect(list.cursor).toBe(5);
  });
});
