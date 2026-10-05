import { describe, expect, it } from "vitest";
import setup, { assertSupportedNode } from "../node-guard.js";

describe("node guard", () => {
  it("names the required floor and the running version when Node is too old", () => {
    expect(() => assertSupportedNode("22.12.0")).toThrow(
      "gup's tests need Node >=26.9.0 (OpenTUI loads its renderer through node:ffi). " +
        "Current: v22.12.0.",
    );
  });

  it.each(["26.9.0", "26.10.0", "27.0.0"])("accepts Node %s", (version) => {
    expect(() => assertSupportedNode(version)).not.toThrow();
  });

  it("passes on the Node running this suite, against MIN_NODE", () => {
    expect(() => setup()).not.toThrow();
  });
});
