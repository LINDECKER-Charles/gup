/**
 * Non-Latin scripts render from their own faces and are never letter-spaced.
 *
 * Tracking breaks Arabic joining and the Devanagari/Bengali headline bar, so
 * text is only ever spaced through a tracking token, and every such token is
 * zeroed for the non-Latin locales. Each of those locales also routes all
 * three faces — sans, display and mono — through its script's fonts: a mono
 * label left on the Latin mono stack falls to whatever the OS picks (Times
 * New Roman for Arabic, NSimSun for Chinese on Windows).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../../src/i18n/locales.js";
import { readStylesheets } from "../helpers/read-css.mjs";

const FACES = ["--font-sans", "--font-display", "--font-mono"];
const CASES = ["--display-case", "--label-case"];

const RULE = /([^{}]+)\{([^{}]*)\}/g;
const DECLARATION = /(?<![\w-])(--[\w-]+|[a-z][a-z-]*)\s*:\s*([^;]+);/g;

/** `{ file, selector, declarations }` for every innermost rule, comments removed. */
function rules({ file, text }) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...code.matchAll(RULE)].map(([, selector, body]) => ({
    file,
    selector: selector.trim(),
    declarations: new Map(
      [...body.matchAll(DECLARATION)].map(([, name, value]) => [
        name,
        value.replace(/\s+/g, " ").trim(),
      ]),
    ),
  }));
}

const sheets = readStylesheets();
const allRules = sheets.flatMap(rules);
const rulesOf = (name) => allRules.filter(({ file }) => file.endsWith(name));
const tokens = rulesOf("tokens.css").find(({ selector }) => selector === ":root").declarations;
const TRACKINGS = [...tokens.keys()].filter((name) => name.includes("-tracking"));
const scriptRules = rulesOf("scripts.css");
const scriptRoot = scriptRules.find(({ selector }) => selector === ":root").declarations;
const nonLatin = LOCALES.filter((locale) => locale.script !== "latin");
const subtagOf = (locale) => locale.htmlLang.split("-")[0];

test("text is only letter-spaced through a tracking token, the Latin brand word aside", () => {
  const literal = allRules
    .filter(({ declarations }) => declarations.has("letter-spacing"))
    .filter(({ declarations }) => declarations.get("font-family") !== "var(--font-brand)")
    .filter(({ declarations }) => {
      const value = declarations.get("letter-spacing");
      return !TRACKINGS.some((name) => value === `var(${name})`);
    })
    .map(({ file, selector }) => `${file}: ${selector}`);
  assert.deepEqual(literal, []);
});

test("non-Latin locales drop the case and every tracking", () => {
  const shared = scriptRules.find(({ selector }) =>
    nonLatin.every((locale) => selector.includes(`:lang(${subtagOf(locale)})`)),
  );
  assert.ok(shared, "one rule must cover every non-Latin locale");
  for (const name of TRACKINGS) assert.equal(shared.declarations.get(name), "0", name);
  for (const name of CASES) assert.equal(shared.declarations.get(name), "none", name);
});

for (const locale of nonLatin) {
  test(`${locale.id}: sans, display and mono all render from the ${locale.script} faces`, () => {
    const own = scriptRules.find(({ selector }) => selector === `html:lang(${subtagOf(locale)})`);
    assert.ok(own, `no html:lang(${subtagOf(locale)}) rule`);
    const faces = `var(--script-${locale.script})`;
    const stack = scriptRoot.get(`--stack-${locale.script}`) ?? "";
    assert.ok(stack.includes(faces), `--stack-${locale.script} is not built from ${faces}`);
    for (const name of FACES) {
      const value = own.declarations.get(name) ?? "";
      const isScripted = value.includes(faces) || value === `var(--stack-${locale.script})`;
      assert.ok(isScripted, `${name}: ${value || "unset"}`);
    }
  });
}
