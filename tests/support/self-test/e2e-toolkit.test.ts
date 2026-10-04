import { describe, expect, it } from "vitest";
import { DOCTOR_PROVIDER_LABELS } from "../../../src/ui/text/providers-labels.js";
import { parseDoctor } from "../e2e/doctor.js";
import { assertScanResults } from "../e2e/scan-schema.js";
import { e2eScope, isE2eEnabled, isMutateEnabled } from "../e2e/scope.js";
import {
  renderSummary,
  summaryRow,
  type ReportedCase,
  type ReportedModule,
} from "../e2e/summary-reporter.js";

/**
 * The pure parts of the end-to-end toolkit: the oracles the real-machine
 * suites judge the built CLI with must themselves be right, and they cannot
 * be checked by the suites they serve.
 */

describe("assertScanResults", () => {
  const valid = [
    { providerId: "npm-g", available: true, packages: [{ id: "a", current: "1", latest: "2" }] },
    { providerId: "pip", available: true, packages: [], error: "boom" },
  ];

  it("accepts `gup list --json` output", () => {
    expect(() => assertScanResults(valid)).not.toThrow();
    expect(() => assertScanResults([])).not.toThrow();
  });

  it.each([
    ["not an array", { providerId: "npm-g" }, /expected an array/],
    ["a missing field", [{ providerId: "npm-g", packages: [] }], /\[0\]: missing "available"/],
    ["a wrong type", [{ ...valid[0], available: "yes" }], /"available" should be boolean/],
    ["an unknown field", [{ ...valid[1], extra: 1 }], /unknown field "extra"/],
    ["a repeated provider", [valid[1], valid[1]], /providerId "pip" is empty or repeated/],
    [
      "a row without a version",
      [{ providerId: "x", available: true, packages: [{ id: "a", current: "1" }] }],
      /\[0\]\.packages\[0\]: missing "latest"/,
    ],
    [
      "a manual row",
      [{ ...valid[0], packages: [{ id: "a", current: "1", latest: "2", manual: true }] }],
      /a manual row reached the output/,
    ],
  ])("refuses %s", (_case, value, message) => {
    expect(() => assertScanResults(value)).toThrow(message);
  });
});

describe("parseDoctor", () => {
  const stdout = [
    `  ${DOCTOR_PROVIDER_LABELS.detected}`,
    "  ────────",
    "  ● WSL (kernel)             (wsl)",
    "  ● npm (global)             (npm-g)",
    "",
    `  ${DOCTOR_PROVIDER_LABELS.missing}`,
    "  ○ Coursier (cs)            (coursier-cs)",
    "      → install it (coursier)",
    "",
    `  ${DOCTOR_PROVIDER_LABELS.incompatible("win32")}`,
    "  – Homebrew (casks)          (brew-cask)        macOS uniquement",
    "",
    "  Système",
    "  ● Terminal intégré         disponible (pty)",
  ].join("\n");

  it("reads each group's ids, the last parenthesis of a row, never a hint", () => {
    expect(parseDoctor(stdout, "win32")).toEqual({
      detected: ["wsl", "npm-g"],
      missing: ["coursier-cs"],
      incompatible: ["brew-cask"],
    });
  });
});

describe("summaryRow", () => {
  const test = (name: string, state: string, extra: Partial<ReportedCase> = {}): ReportedCase => ({
    name,
    result: () => ({ state }),
    annotations: () => [],
    ...extra,
  });
  const module = (cases: readonly ReportedCase[]): ReportedModule => ({
    relativeModuleId: "tests/e2e/smoke/cli-smoke.e2e.test.ts",
    children: { allTests: () => cases },
    diagnostic: () => ({ duration: 3456 }),
  });

  it("passes with the tests' notes, and names the suite by its path under tests/e2e", () => {
    const note = { message: "first frame 310 ms" };
    const noted = test("boots", "passed", { annotations: () => [note] });
    expect(summaryRow(module([noted, test("quits", "passed")]))).toEqual({
      suite: "smoke/cli-smoke",
      result: "PASS 2/2 · first frame 310 ms",
      seconds: 3.456,
    });
  });

  it("fails with the count and the first failed test", () => {
    const row = summaryRow(module([test("a", "passed"), test("b", "failed"), test("c", "failed")]));
    expect(row.result).toBe("FAIL 2/3 · b");
  });

  it("says when every test skipped, and why", () => {
    const result = (): { state: string; note: string } => ({ state: "skipped", note: "off" });
    const skipped = test("mutates", "skipped", { result });
    expect(summaryRow(module([skipped])).result).toBe("SKIP · off");
  });
});

describe("renderSummary", () => {
  it("renders a markdown table, pipes escaped", () => {
    const row = { suite: "full/list", result: "PASS 1/1 · a | b", seconds: 12.06 };
    expect(renderSummary("gup E2E", [row]).split("\n")).toEqual([
      "### gup E2E",
      "",
      "| suite | result | time |",
      "|---|---|---|",
      "| full/list | PASS 1/1 · a \\| b | 12.1 s |",
    ]);
  });
});

describe("the e2e switches", () => {
  it("are off unless set to 1, and the scope is full unless smoke", () => {
    expect(isE2eEnabled({})).toBe(false);
    expect(isE2eEnabled({ GUP_E2E: "1" })).toBe(true);
    expect(isMutateEnabled({ GUP_MUTATE: "true" })).toBe(false);
    expect(e2eScope({})).toBe("full");
    expect(e2eScope({ GUP_E2E_SCOPE: " Smoke " })).toBe("smoke");
  });
});
