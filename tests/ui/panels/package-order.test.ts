import { describe, expect, it } from "vitest";
import type { OutdatedPackage } from "../../../src/core/types.js";
import { orderPackages } from "../../../src/ui/panels/package-order.js";

const pkg = (id: string, current: string, latest: string): OutdatedPackage => ({
  id,
  current,
  latest,
});
const ids = (packages: readonly OutdatedPackage[]) => packages.map((p) => p.id);

const PACKAGES = [
  pkg("zed", "0.1.0", "0.1.1"),
  pkg("App10", "1.0", "1.1"),
  pkg("app2", "1.0.0", "2.0.0"),
  pkg("éclair", "rolling", "rolling-next"),
  { ...pkg("Bun", "1.2.3", "1.3.0"), name: "bun" },
];

describe("orderPackages", () => {
  it("keeps the provider's order", () => {
    const order = ["zed", "App10", "app2", "éclair", "Bun"];
    expect(ids(orderPackages(PACKAGES, "provider"))).toEqual(order);
  });

  it("sorts by name, case and accents aside, numbers by value", () => {
    expect(ids(orderPackages(PACKAGES, "name"))).toEqual(["app2", "App10", "Bun", "éclair", "zed"]);
  });

  it("puts the biggest version jumps first, unreadable versions last, ties by name", () => {
    expect(ids(orderPackages(PACKAGES, "bump"))).toEqual(["app2", "App10", "Bun", "zed", "éclair"]);
  });

  it("never reorders the list it was given", () => {
    const given = [...PACKAGES];
    orderPackages(given, "name");
    expect(given).toEqual(PACKAGES);
  });
});
