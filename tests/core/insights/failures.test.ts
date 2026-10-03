import { describe, expect, it } from "vitest";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import { MAX_FAILURE_MESSAGE, normalizeMessage } from "../../../src/core/insights/failures.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { updateEvent } from "../../support/history-fixtures.js";

const PERIOD = parsePeriod("all", new Date("2026-12-31T00:00:00Z"))!;

const failed = (pkg: string, message: string, ts: string) =>
  updateEvent("choco", pkg, { status: "failed", message, ts });

describe("failure groups", () => {
  it("groups the failures of a package by the first line of their message", () => {
    const { failures } = buildInsights(
      [
        failed("nodejs", "exit code 1603\nat 10:02", "2026-10-01T10:00:00.000Z"),
        failed("nodejs", "exit   code 1603\nat 11:40", "2026-10-02T10:00:00.000Z"),
        failed("nodejs", "checksum mismatch", "2026-10-03T10:00:00.000Z"),
        failed("git", "exit code 1603", "2026-10-03T11:00:00.000Z"),
        updateEvent("choco", "nodejs", { ts: "2026-10-04T10:00:00.000Z" }),
      ],
      { period: PERIOD },
    );

    expect(failures).toEqual([
      { providerId: "choco", packageId: "nodejs", message: "exit code 1603", count: 2, lastAt: "2026-10-02T10:00:00.000Z" },
      { providerId: "choco", packageId: "git", message: "exit code 1603", count: 1, lastAt: "2026-10-03T11:00:00.000Z" },
      { providerId: "choco", packageId: "nodejs", message: "checksum mismatch", count: 1, lastAt: "2026-10-03T10:00:00.000Z" },
    ]);
  });

  it("normalises a message to one bounded line", () => {
    expect(normalizeMessage("\n  first\tline  \r\nsecond")).toBe("first line");
    expect(normalizeMessage(undefined)).toBe("");
    expect(normalizeMessage("x".repeat(500))).toHaveLength(MAX_FAILURE_MESSAGE);
  });
});
