/**
 * WCAG 2.2 AA on the design tokens: every text colour reaches 4.5:1 on every
 * surface it is drawn on, and focus/control boundaries reach 3:1. The second
 * half makes the token list exhaustive: no rule may set `color` from a
 * literal, and decoration tokens never colour text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio } from "../helpers/oklch.mjs";
import { readStylesheets } from "../helpers/read-css.mjs";

const AA_TEXT = 4.5;
const AA_UI = 3;

const sheets = readStylesheets();
const tokensCss = sheets.find(({ file }) => file.endsWith("tokens.css")).text;
const TOKENS = Object.fromEntries(
  [...tokensCss.matchAll(/--([a-z-]+):\s*(oklch\([^)/]*\));/g)].map(([, name, value]) => [
    name,
    value,
  ]),
);

const TEXT_PAIRS = [
  ...["fg", "fg-muted", "fg-soft", "fg-dim", "violet-text"].flatMap((fg) =>
    ["bg", "bg-deep", "surface", "surface-raised", "chip-bg"].map((bg) => [fg, bg]),
  ),
  ["violet-ink", "violet"],
  ["violet-ink", "violet-lit"],
  ["violet-ink", "fg"],
  ["amber-ink", "amber"],
  ["amber-ink", "amber-lit"],
  ...["green", "amber", "lilac", "red"].flatMap((fg) => [
    [fg, "bg-deep"],
    [fg, "surface-raised"],
  ]),
];
const UI_PAIRS = [
  ["violet-text", "bg"],
  ["violet-text", "surface"],
  ["violet", "bg"],
  ["violet", "bg-deep"],
];

for (const [foreground, background] of TEXT_PAIRS) {
  test(`text --${foreground} on --${background} ≥ ${AA_TEXT}:1`, () => {
    const ratio = contrastRatio(TOKENS[foreground], TOKENS[background]);
    assert.ok(ratio >= AA_TEXT, `${ratio.toFixed(2)}:1`);
  });
}

for (const [foreground, background] of UI_PAIRS) {
  test(`focus/control --${foreground} on --${background} ≥ ${AA_UI}:1`, () => {
    const ratio = contrastRatio(TOKENS[foreground], TOKENS[background]);
    assert.ok(ratio >= AA_UI, `${ratio.toFixed(2)}:1`);
  });
}

test("every text colour comes from a token", () => {
  const literal = sheets.flatMap(({ file, text }) =>
    [...text.matchAll(/(?<![-\w])color:\s*([^;]+);/g)]
      .map(([, value]) => value.trim())
      .filter((value) => !/^(var\(--[a-z-]+\)|inherit|currentColor|transparent)$/.test(value))
      .map((value) => `${file}: ${value}`),
  );
  assert.deepEqual(literal, []);
});

test("every token a rule colours text with is covered above", () => {
  const covered = new Set(TEXT_PAIRS.map(([foreground]) => foreground));
  const used = new Set(
    sheets.flatMap(({ text }) =>
      [...text.matchAll(/(?<![-\w])color:\s*var\(--([a-z-]+)\)/g)].map(([, name]) => name),
    ),
  );
  assert.deepEqual([...used].filter((name) => !covered.has(name)), []);
});

test("decoration tokens never colour text", () => {
  const misuse = sheets.filter(({ text }) => /(?<![-\w])color:\s*var\(--deco-/.test(text));
  assert.deepEqual(misuse.map(({ file }) => file), []);
});
