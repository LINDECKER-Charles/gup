import { Script } from "node:vm";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { REPORT_JS } from "../../../src/report/client/index.js";
import { REPORT_LABELS } from "../../../src/report/report-labels.js";

/**
 * The report's client script is plain JavaScript in a TypeScript string, out
 * of reach of tsc and of the repository's lint. It is held to the same
 * limits here (amendment O-2), with browser globals only, and searched for
 * the sinks and the network references it must never contain.
 */

const BROWSER_GLOBALS = Object.fromEntries(
  [
    "window",
    "document",
    "navigator",
    "location",
    "localStorage",
    "HTMLElement",
    "URLSearchParams",
    "setTimeout",
  ].map((name) => [name, "readonly" as const]),
);

const RULES: Linter.RulesRecord = {
  "no-undef": "error",
  "no-unused-vars": ["error", { caughtErrors: "all" }],
  "max-lines-per-function": ["error", { max: 30, skipBlankLines: true, skipComments: true }],
  complexity: ["error", 10],
  "max-depth": ["error", 3],
  "max-params": ["error", 3],
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-script-url": "error",
  "no-restricted-properties": [
    "error",
    ...["innerHTML", "outerHTML", "insertAdjacentHTML", "write", "writeln"].map((property) => ({
      property,
      message: "the report builds its DOM node by node",
    })),
  ],
};

/** Strings that would parse markup, run code from a string or reach the network. */
const FORBIDDEN_TOKENS = [
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "document.write",
  "eval(",
  "new Function",
  'setTimeout("',
  "javascript:",
  "http://",
  "https://",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "import(",
];

function lint(source: string): Linter.LintMessage[] {
  return new Linter({ configType: "flat" }).verify(source, [
    {
      languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: BROWSER_GLOBALS },
      rules: RULES,
    },
  ]);
}

describe("report client script", () => {
  it("passes the size, complexity and dead-code limits with browser globals only", () => {
    const problems = lint(REPORT_JS).map(
      ({ line, column, ruleId, message }) => `${line}:${column} ${ruleId ?? "parse"} ${message}`,
    );

    expect(problems).toEqual([]);
  });

  it("compiles as a classic script", () => {
    expect(() => new Script(REPORT_JS)).not.toThrow();
  });

  it.each(FORBIDDEN_TOKENS)("never contains %s", (token) => {
    expect(REPORT_JS).not.toContain(token);
  });

  it("cannot close its own script element", () => {
    expect(REPORT_JS).not.toMatch(/<\/script/i);
  });

  it("asks only for labels that exist", () => {
    // A key ending with a dot is completed at run time: its group must exist.
    const keys = [...REPORT_JS.matchAll(/\btn?\("([\w.]+)"/g)].map((match) => match[1] ?? "");
    const missing = keys.filter((key) => lookup(key.replace(/\.$/, "")) === undefined);

    expect(keys.length).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });
});

function lookup(path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node === null || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[key];
  }, REPORT_LABELS);
}
