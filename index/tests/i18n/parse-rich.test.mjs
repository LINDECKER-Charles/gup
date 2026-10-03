import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRich } from "../../src/i18n/parse-rich.js";

test("plain text is a single text token", () => {
  assert.deepEqual(parseRich("Just words."), [{ kind: "text", value: "Just words." }]);
});

test("empty string yields no token", () => {
  assert.deepEqual(parseRich(""), []);
});

test("code, strong and kbd spans become typed tokens", () => {
  assert.deepEqual(parseRich("Run `gup` with **care**, then press [[Enter]]."), [
    { kind: "text", value: "Run " },
    { kind: "code", value: "gup" },
    { kind: "text", value: " with " },
    { kind: "strong", value: "care" },
    { kind: "text", value: ", then press " },
    { kind: "kbd", value: "Enter" },
    { kind: "text", value: "." },
  ]);
});

test("adjacent markup spans are kept apart", () => {
  assert.deepEqual(parseRich("`a``b`[[c]]"), [
    { kind: "code", value: "a" },
    { kind: "code", value: "b" },
    { kind: "kbd", value: "c" },
  ]);
});

test("a single asterisk inside strong text is allowed", () => {
  assert.deepEqual(parseRich("**a*b**"), [{ kind: "strong", value: "a*b" }]);
});

for (const [label, input] of [
  ["unclosed code", "run `gup"],
  ["unclosed strong", "**bold"],
  ["stray kbd closer", "press Enter]]"],
  ["unclosed kbd", "press [[Enter"],
]) {
  test(`unbalanced markup throws: ${label}`, () => {
    assert.throws(() => parseRich(input), /unbalanced markup/);
  });
}

test("nested markup throws", () => {
  assert.throws(() => parseRich("**run `gup`**"), /nested markup/);
  assert.throws(() => parseRich("`a **b`"), /nested markup/);
});

test("empty markup throws", () => {
  assert.throws(() => parseRich("an `` empty span"), /empty markup/);
});
