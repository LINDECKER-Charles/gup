/**
 * Logical properties only: right-to-left pages mirror for free when no rule
 * names a physical side. A line may opt out with a `physical-ok: <reason>`
 * comment (the terminal, which is left-to-right by definition).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readStylesheets } from "../helpers/read-css.mjs";

const PHYSICAL = [
  /(?<![-\w])(margin|padding|border)-(left|right)\b/,
  /(?<![-\w])(left|right)\s*:/,
  /(?<![-\w])text-align:\s*(left|right)\b/,
  /(?<![-\w])float:\s*(left|right)\b/,
  /(?<![-\w])border-(top|bottom)-(left|right)-radius\b/,
];
/** Four-value margin/padding/inset whose right (2nd) and left (4th) values differ. */
const FOUR_VALUES = /(?<![-\w])(margin|padding|inset):\s*(\S+)\s+(\S+)\s+(\S+)\s+([^\s;]+)\s*;/;

/** Comments blanked (line count kept); a `physical-ok:` comment marks its line. */
function codeLines(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      (comment.includes("physical-ok:") ? "PHYSICAL_OK" : "") + comment.replace(/[^\n]/g, ""),
    )
    .split("\n");
}

function physicalLines(text) {
  return codeLines(text).filter((line) => {
    if (line.includes("PHYSICAL_OK")) return false;
    const four = line.match(FOUR_VALUES);
    return PHYSICAL.some((pattern) => pattern.test(line)) || (four && four[3] !== four[5]);
  });
}

test("the checker recognises physical properties", () => {
  const sample = [
    "a { margin-left: 1px; }",
    "a { right: 0; }",
    "a { text-align: right; }",
    "a { padding: 1px 2px 3px 4px; }",
    "a { border-top-left-radius: 2px; }",
  ];
  for (const line of sample) assert.equal(physicalLines(line).length, 1, line);
  const logical = "a { margin-inline-start: 1px; inset-inline-end: 0; padding: 1px 2px 3px 2px; }";
  assert.equal(physicalLines(logical).length, 0);
  assert.equal(physicalLines("a { text-align: left; /* physical-ok: terminal */ }").length, 0);
});

for (const { file, text } of readStylesheets()) {
  test(`${file} uses logical properties only`, () => {
    assert.deepEqual(physicalLines(text), []);
  });
}
