import { describe, expect, it } from "vitest";
import { buildReport, entryOf, exitCodeOf } from "../../../src/core/update/update-report.js";
import type { PlannedUpdate } from "../../../src/core/update/update-ports.js";

const item = (packageId: string): PlannedUpdate => ({
  providerId: "p",
  packageId,
  key: `p:${packageId}`,
  providerName: "P",
});

describe("buildReport", () => {
  it("splits outcomes into successes, skips and failures, in entry order", () => {
    const report = buildReport(
      [
        entryOf(item("a"), { id: "a", success: true }),
        entryOf(item("b"), { id: "b", success: false, skipped: true }),
        entryOf(item("c"), { id: "c", success: false }),
        entryOf(item("d"), { id: "d", success: true, message: "redémarrage requis" }),
      ],
      [item("e")],
    );
    expect(report.succeeded.map((o) => o.id)).toEqual(["a", "d"]);
    expect(report.skipped.map((o) => o.id)).toEqual(["b"]);
    expect(report.failed.map((o) => o.id)).toEqual(["c"]);
    expect(report.cancelled.map((i) => i.key)).toEqual(["p:e"]);
  });
});

describe("exitCodeOf", () => {
  it("fails the run on a failure only — a skip is a decision", () => {
    const skipped = buildReport([entryOf(item("a"), { id: "a", success: false, skipped: true })], []);
    const failed = buildReport([entryOf(item("a"), { id: "a", success: false })], []);
    expect(exitCodeOf(skipped)).toBe(0);
    expect(exitCodeOf(failed)).toBe(1);
    expect(exitCodeOf(buildReport([], [item("a")]))).toBe(0);
  });
});
