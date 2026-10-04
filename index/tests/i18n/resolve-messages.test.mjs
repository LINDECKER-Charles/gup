import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMessages } from "../../build/i18n/resolve-messages.mjs";

const VARS = Object.freeze({
  providers: "153",
  version: "0.5.0",
  node: "26",
  nodeEngine: "26.9.0",
  packageName: "@charles_lindecker/gup",
  installCommand: "npm install -g @charles_lindecker/gup",
  year: "2026",
  endonym: "English",
});

const resolve = (raw, overrides = {}) =>
  resolveMessages(raw, { vars: VARS, pluralLocale: "en", localeId: "xx", ...overrides });

test("placeholders are filled and the tree shape is kept", () => {
  const raw = { hero: { title: "{providers} sources", trust: ["Node ≥ {node}", "MIT"] } };
  assert.deepEqual(resolve(raw), { hero: { title: "153 sources", trust: ["Node ≥ 26", "MIT"] } });
});

test("markup survives resolution untouched", () => {
  assert.equal(resolve({ a: "Run `{installCommand}`" }).a, `Run \`${VARS.installCommand}\``);
});

test("plural selection follows the locale's CLDR rules", () => {
  const arabic = {
    $count: "providers",
    zero: "z",
    one: "o",
    two: "t",
    few: "f",
    many: "{providers} m",
    other: "x",
  };
  assert.equal(resolve({ a: arabic }, { pluralLocale: "ar" }).a, "153 m");
  const english = { $count: "providers", one: "o", other: "{providers} x" };
  assert.equal(resolve({ a: english }).a, "153 x");
});

test("every plural form is validated, not only the selected one", () => {
  const raw = { a: { $count: "providers", one: "{nope}", other: "{providers} x" } };
  assert.throws(() => resolve(raw), /^Error: xx:a: unknown placeholder \{nope\}$/);
});

test("a missing plural category throws with the key path", () => {
  const raw = { coverage: { title: { $count: "providers", one: "o", many: "m" } } };
  assert.throws(
    () => resolve(raw, { pluralLocale: "fr" }),
    /^Error: xx:coverage\.title: missing plural form\(s\): other$/,
  );
});

test("a plural form the locale does not use throws", () => {
  const raw = { a: { $count: "providers", one: "o", few: "f", other: "x" } };
  assert.throws(() => resolve(raw), /xx:a: plural form "few" is not used by en/);
});

test("an unknown placeholder throws with the key path", () => {
  assert.throws(
    () => resolve({ hero: { lead: "{foo} bar" } }),
    /^Error: xx:hero\.lead: unknown placeholder \{foo\}$/,
  );
});

test("a known placeholder without a value throws", () => {
  const vars = { ...VARS, year: undefined };
  assert.throws(
    () => resolve({ a: "© {year}" }, { vars }),
    /xx:a: no value for placeholder \{year\}/,
  );
});

test("malformed markup throws with the key path", () => {
  assert.throws(() => resolve({ faq: { a: "run `gup" } }), /^Error: xx:faq\.a: unbalanced markup/);
});

test("markup in a plain-text namespace throws", () => {
  for (const root of ["meta", "common", "nav"]) {
    assert.throws(() => resolve({ [root]: { x: "a **b**" } }), /markup in a plain-text key/);
  }
  assert.doesNotThrow(() => resolve({ hero: { x: "a **b**" } }));
});

test("array items carry their index in the error path", () => {
  assert.throws(() => resolve({ hero: { trust: ["ok", "{bad}"] } }), /xx:hero\.trust\.1:/);
});

test("non-string leaves are rejected", () => {
  assert.throws(() => resolve({ a: 3 }), /xx:a: unsupported value 3/);
});
