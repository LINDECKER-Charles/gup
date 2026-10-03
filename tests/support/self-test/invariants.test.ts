import { describe, expect, it } from "vitest";
import type { OutdatedPackage, Provider } from "../../../src/core/types.js";
import {
  formatViolation,
  outcomeViolations,
  REFRESH_MARKER,
  rowViolations,
  shellViolations,
  slowFlagViolations,
  UNKNOWN_VERSION,
  unwaived,
  updateAllViolations,
} from "../contract/invariants.js";
import type { UpdateAllShape } from "../contract/types.js";

const ROW: OutdatedPackage = { id: "a", current: "1.0.0", latest: "2.0.0" };

function invariantsOf(rows: readonly OutdatedPackage[]): string[] {
  return rowViolations(rows).map((violation) => violation.invariant);
}

function provider(slow?: boolean): Provider {
  return {
    id: "p",
    displayName: "P",
    ...(slow !== undefined && { slow }),
    isAvailable: async () => true,
    listOutdated: async () => [],
    update: async (id) => ({ id, success: true }),
    updateAll: async () => [],
  };
}

describe("row invariants", () => {
  it("accept well-formed, truly outdated, distinct rows", () => {
    expect(rowViolations([ROW, { ...ROW, id: "b", name: "B", note: "via scoop" }])).toEqual([]);
  });

  it.each([
    ["an id with surrounding spaces", { ...ROW, id: " a" }],
    ["an empty id", { ...ROW, id: "" }],
    ["an empty current", { ...ROW, current: "" }],
    ["an empty latest", { ...ROW, latest: "" }],
    ["an empty name", { ...ROW, name: "" }],
    ["an empty note", { ...ROW, note: "" }],
  ])("reject %s as row-shape", (_label, row) => {
    expect(invariantsOf([row])).toEqual(["row-shape"]);
  });

  it("reject a row that is not outdated", () => {
    expect(rowViolations([{ ...ROW, latest: "1.0.0" }])).toEqual([
      { invariant: "row-current-differs", detail: 'row 0 ("a"): current equals latest ("1.0.0")' },
    ]);
  });

  it("accept the synthetic markers providers use when a version is unknowable", () => {
    const rows = [
      { id: "x", current: UNKNOWN_VERSION, latest: UNKNOWN_VERSION },
      { id: "y", current: REFRESH_MARKER, latest: REFRESH_MARKER },
    ];

    expect(rowViolations(rows)).toEqual([]);
  });

  it("reject a duplicate id", () => {
    expect(invariantsOf([ROW, ROW])).toEqual(["row-unique-ids"]);
  });
});

describe("outcome invariants", () => {
  it("accept an outcome for the requested package", () => {
    expect(outcomeViolations({ id: "a", success: false, skipped: true }, "a")).toEqual([]);
  });

  it("reject another package's id, and skipped or retryable successes", () => {
    const contradictory = { id: "b", success: true, skipped: true, retryable: true };
    const violations = outcomeViolations(contradictory, "a");

    expect(violations.map(formatViolation)).toEqual([
      'outcome-id: outcome for "a" has id "b"',
      'outcome-id: outcome for "a" is both skipped and successful',
      'outcome-id: outcome for "a" is both retryable and successful',
    ]);
  });
});

describe("update-no-shell", () => {
  it("allows scoop's shim through a shell and nothing else", () => {
    const violations = shellViolations([
      { mode: "inherit", argv: ["scoop", "update", "x"], shell: true },
      { mode: "inherit", argv: ["winget", "upgrade"], shell: false },
      { mode: "inherit", argv: ["choco", "upgrade", "x"], shell: true },
    ]);

    expect(violations.map(formatViolation)).toEqual([
      'update-no-shell: ["choco","upgrade","x"] is spawned through a shell',
    ]);
  });
});

describe("slow-flag", () => {
  const rows = [ROW, { ...ROW, id: "b" }];

  it("requires `slow` from a provider fetching once per row", () => {
    expect(slowFlagViolations(provider(), rows, 2)).toHaveLength(1);
    expect(slowFlagViolations(provider(true), rows, 2)).toEqual([]);
  });

  it("leaves single-row and request-free scans alone", () => {
    expect(slowFlagViolations(provider(), [ROW], 5)).toEqual([]);
    expect(slowFlagViolations(provider(), rows, 1)).toEqual([]);
  });
});

describe("updateAll shapes", () => {
  const rows = [ROW, { ...ROW, id: "b" }];
  const perRow = [
    { id: "a", success: true },
    { id: "b", success: true },
  ];

  it.each([
    ["per-package", perRow, 2],
    ["one-batch", perRow, 1],
    ["collapsed", [{ id: "self", success: true }], 1],
    ["skipped", rows.map((row) => ({ id: row.id, success: false, skipped: true })), 0],
  ] as const)("accept a %s run that matches", (shape: UpdateAllShape, outcomes, installCount) => {
    const observation = { rows, outcomes, installCount, installsPerPackage: 1 };

    expect(updateAllViolations(shape, observation)).toEqual([]);
  });

  it("scale the per-package install count with the installs one update performs", () => {
    const observation = { rows, outcomes: perRow, installCount: 4, installsPerPackage: 2 };

    expect(updateAllViolations("per-package", observation)).toEqual([]);
  });

  it("scale the collapsed install count with the installs its one update performs", () => {
    const outcomes = [{ id: "self", success: true }];
    const observation = { rows, outcomes, installCount: 2, installsPerPackage: 2 };

    expect(updateAllViolations("collapsed", observation)).toEqual([]);
  });

  it("report every mismatch", () => {
    const observation = {
      rows,
      outcomes: [{ id: "b", success: true }, { id: "a", success: true }],
      installCount: 2,
      installsPerPackage: 1,
    };

    expect(updateAllViolations("skipped", observation).map(formatViolation)).toEqual([
      "updateAll-shape: skipped: 2 install(s), expected 0",
      'updateAll-shape: skipped: outcomes ["b","a"], expected ["a","b"]',
      "updateAll-shape: skipped: an outcome is not skipped",
    ]);
  });

  it("require a single outcome from a collapsed run", () => {
    const observation = { rows, outcomes: perRow, installCount: 1, installsPerPackage: 1 };

    expect(updateAllViolations("collapsed", observation).map(formatViolation)).toEqual([
      "updateAll-shape: collapsed: 2 outcome(s), expected 1",
    ]);
  });
});

describe("waivers", () => {
  it("drop exactly the waived invariants", () => {
    const violations = [
      { invariant: "slow-flag" as const, detail: "x" },
      { invariant: "row-shape" as const, detail: "y" },
    ];

    expect(unwaived(violations, [{ invariant: "slow-flag", reason: "documented" }])).toEqual([
      { invariant: "row-shape", detail: "y" },
    ]);
  });
});
