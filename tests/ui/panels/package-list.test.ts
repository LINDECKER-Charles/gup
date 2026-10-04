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

  it("checks everything shown, then clears it, and tells which one comes next", () => {
    const list = make();
    expect(list.isAllVisibleChecked()).toBe(false);
    list.toggleAllVisible();
    expect(ids(list)).toEqual(["typescript", "Git.Git", "7zip.7zip"]);
    expect(list.isAllVisibleChecked()).toBe(true);
    list.toggleAllVisible();
    expect(ids(list)).toEqual([]);
    expect(list.isAllVisibleChecked()).toBe(false);
  });

  it("judges “everything checked” on what the filter shows only", () => {
    const list = make();
    list.setFilter("winget");
    list.toggleAllVisible();
    expect(list.isAllVisibleChecked()).toBe(true);
    list.setFilter("");
    expect(list.isAllVisibleChecked()).toBe(false);
    list.setFilter("nothing matches this");
    expect(list.isAllVisibleChecked()).toBe(false);
    expect(ids(list)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("keeps the cursor inside the list", () => {
    const list = make();
    list.move(-5);
    expect(list.cursor).toBe(0);
    list.move(50);
    expect(list.cursor).toBe(5);
  });
});

describe("PackageList order", () => {
  const scans: ProviderScanResult[] = [
    {
      providerId: "winget",
      available: true,
      packages: [
        { id: "b-patch", current: "1.0.0", latest: "1.0.1" },
        { id: "a-major", current: "1.0.0", latest: "2.0.0" },
        { id: "c-minor", current: "1.0.0", latest: "1.1.0" },
      ],
    },
  ];
  const packageIds = (list: PackageList) =>
    list.rows.flatMap((row) => (row.kind === "package" ? [row.pkg.id] : []));

  it("follows the preferred sort as soon as it changes, checks kept", () => {
    let sort: "provider" | "name" | "bump" = "provider";
    const list = new PackageList(scans, (id) => id, { sort: () => sort });
    expect(packageIds(list)).toEqual(["b-patch", "a-major", "c-minor"]);
    list.moveTo(1);
    list.toggleCurrent();
    sort = "name";
    expect(packageIds(list)).toEqual(["a-major", "b-patch", "c-minor"]);
    sort = "bump";
    expect(packageIds(list)).toEqual(["a-major", "c-minor", "b-patch"]);
    expect(list.selection.map((s) => s.pkg.id)).toEqual(["b-patch"]);
  });
});
