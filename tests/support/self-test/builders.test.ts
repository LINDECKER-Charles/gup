import { describe, expect, it } from "vitest";
import { outcome, pkg, scan } from "../builders.js";
import { pick, seededRandom } from "../random.js";

describe("data builders", () => {
  it("build the smallest valid row, outcome and scan", () => {
    expect(pkg("git")).toEqual({ id: "git", current: "1.0.0", latest: "2.0.0" });
    expect(outcome("git")).toEqual({ id: "git", success: true });
    expect(scan("winget")).toEqual({ providerId: "winget", available: true, packages: [] });
  });

  it("let a test override any field", () => {
    expect(pkg("git", { latest: "3.0.0", manual: true })).toEqual({
      id: "git",
      current: "1.0.0",
      latest: "3.0.0",
      manual: true,
    });
    expect(outcome("git", { success: false, retryable: true })).toEqual({
      id: "git",
      success: false,
      retryable: true,
    });
    expect(scan("az", [pkg("az")], { error: "exit 1" })).toEqual({
      providerId: "az",
      available: true,
      packages: [pkg("az")],
      error: "exit 1",
    });
  });

  it("never share the packages array with the caller", () => {
    const packages = [pkg("a")];
    const result = scan("npm-g", packages);

    packages.push(pkg("b"));

    expect(result.packages).toEqual([pkg("a")]);
  });
});

describe("seeded random", () => {
  it("replays the same sequence for the same seed", () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    const draws = Array.from({ length: 5 }, () => [first(), second()]);

    expect(draws.every(([a, b]) => a === b)).toBe(true);
  });

  it("gives different seeds different sequences, all within [0, 1)", () => {
    const one = Array.from({ length: 100 }, seededRandom(1));
    const two = Array.from({ length: 100 }, seededRandom(2));

    expect(one).not.toEqual(two);
    expect([...one, ...two].every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("picks deterministically and refuses an empty list", () => {
    const items = ["a", "b", "c", "d"];

    expect(pick(seededRandom(7), items)).toBe(pick(seededRandom(7), items));
    expect(() => pick(seededRandom(7), [])).toThrow(RangeError);
  });
});
