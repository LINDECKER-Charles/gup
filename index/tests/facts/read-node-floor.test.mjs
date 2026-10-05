/**
 * The reader behind facts.js's `nodeMajor` and `nodeEngine`: the `MIN_NODE`
 * gup enforces, from its source, and the shapes it refuses rather than state
 * a floor gup does not check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readNodeFloor } from "../../build/facts/read-node-floor.mjs";

const source = (line) => `import semver from "semver";\n\n/** The floor. */\n${line}\n`;

test("reads the exact minimum MIN_NODE holds", () => {
  assert.equal(readNodeFloor(source('export const MIN_NODE = "26.9.0";')), "26.9.0");
});

test("reads a CRLF checkout the same way", () => {
  const crlf = source('export const MIN_NODE = "26.9.0";').replaceAll("\n", "\r\n");
  assert.equal(readNodeFloor(crlf), "26.9.0");
});

test("refuses a source without the constant, or with a range in it", () => {
  assert.throws(() => readNodeFloor(source("export const FLOOR = 26;")), /no `export const/);
  assert.throws(() => readNodeFloor(source('export const MIN_NODE = ">=26.9.0";')), /no `export/);
  assert.throws(() => readNodeFloor(source('// export const MIN_NODE = "26.9.0";')), /no `export/);
});

test("reads gup's own floor", () => {
  const real = readFileSync(new URL("../../../src/core/node-floor.ts", import.meta.url), "utf8");
  assert.match(readNodeFloor(real), /^\d+\.\d+\.\d+$/);
});
