/**
 * Catalog parity: every translation must say the same things as the English
 * source — same keys, same placeholders, same commands, same key caps, same
 * protected product names — and fit the SERP budgets once resolved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGS } from "../../build/i18n/load-catalogs.mjs";
import { GLOSSARY } from "../../build/i18n/glossary.mjs";
import { resolveMessages } from "../../build/i18n/resolve-messages.mjs";
import { LOCALES } from "../../src/i18n/locales.js";
import { parseRich } from "../../src/i18n/parse-rich.js";
import { facts, installCommand, providersByDomain } from "../../src/data/facts.js";
import { displayWidth } from "../../build/i18n/display-width.mjs";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

/** Leaves whose English text is also correct in other languages. */
const SAME_AS_ENGLISH = new Set([
  "nav.faq",
  "faq.kicker",
  "hero.terminal.tabs.json",
  "hero.trust.0",
  "hero.trust.2",
  "coverage.domains.wsl",
  "coverage.domains.node",
  "coverage.domains.python",
  "coverage.domains.jvm",
  "coverage.domains.rust",
  "coverage.domains.kubernetes",
  "install.support.kofi",
  "install.support.sponsors",
  "footer.links.issues",
  "footer.links.installation",
  "footer.links.architecture",
  "footer.links.llms",
  "footer.columns.docs",
  "footer.legal",
  "hero.title.accent",
  "hero.trust.1",
  "hero.terminal.tabs.app",
]);

const english = CATALOGS.en;
const translations = Object.entries(CATALOGS).filter(([id]) => id !== "en");
const isPlural = (node) => typeof node === "object" && node !== null && "$count" in node;

/** [path, leaf] pairs; a plural object counts as one leaf. */
function leaves(node, path = []) {
  if (typeof node === "string" || isPlural(node)) return [[path.join("."), node]];
  return Object.entries(node).flatMap(([key, child]) => leaves(child, [...path, key]));
}

function variants(leaf) {
  if (typeof leaf === "string") return [leaf];
  return Object.entries(leaf)
    .filter(([key]) => key !== "$count")
    .map(([, text]) => text);
}

const placeholders = (text) => [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).sort();
const spans = (text, kind) => parseRich(text).filter((t) => t.kind === kind).map((t) => t.value);
const englishLeaves = new Map(leaves(english));

function varsFor(locale) {
  return {
    providers: String(facts.providerCount),
    version: facts.version,
    node: String(facts.nodeMajor),
    nodeEngine: facts.nodeEngine,
    packageName: facts.packageName,
    installCommand,
    year: "2026",
    endonym: locale.endonym,
  };
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/*
 * Word boundaries are Latin-only: "brew" must not match inside "Homebrew", but
 * a protected term may touch a letter of another script — Arabic attaches the
 * conjunction و ("and") to the next word, Latin names included ("وbrew").
 */
const LATIN = "\\p{Script=Latin}";
const matchesTerm = (text, term) =>
  new RegExp(`(?<![${LATIN}\\p{N}])${escapeRegExp(term)}(?![${LATIN}\\p{N}])`, "u").test(text);
const matchesNoun = (text, noun) =>
  new RegExp(`(?<!${LATIN})${noun}s?(?!${LATIN})`, "iu").test(text);

test("glossary terms are matched on Latin word boundaries only", () => {
  assert.equal(matchesTerm("Homebrew", "brew"), false);
  assert.equal(matchesTerm("pip3", "pip"), false);
  assert.equal(matchesTerm("winget وbrew", "brew"), true);
  assert.equal(matchesNoun("每个 providers", "provider"), true);
  assert.equal(matchesNoun("subproviders", "provider"), false);
});

test("every registered locale has a catalog, and nothing else does", () => {
  assert.deepEqual(Object.keys(CATALOGS).sort(), LOCALES.map((l) => l.id).sort());
});

test("no catalog leaf is empty", () => {
  for (const [id, catalog] of Object.entries(CATALOGS)) {
    for (const [path, leaf] of leaves(catalog)) {
      for (const text of variants(leaf)) assert.ok(text.trim(), `${id}:${path} is empty`);
    }
  }
});

for (const [id, catalog] of translations) {
  const translated = new Map(leaves(catalog));

  test(`${id}: same key tree as en (arrays included)`, () => {
    assert.deepEqual([...translated.keys()].sort(), [...englishLeaves.keys()].sort());
  });

  test(`${id}: same placeholders, code spans and key caps as en`, () => {
    for (const [path, leaf] of translated) {
      const source = variants(englishLeaves.get(path) ?? "")[0];
      for (const text of variants(leaf)) {
        const where = `${id}:${path}`;
        assert.deepEqual(placeholders(text), placeholders(source), `${where} placeholders`);
        assert.deepEqual(spans(text, "code").sort(), spans(source, "code").sort(), `${where} code`);
        assert.equal(spans(text, "kbd").length, spans(source, "kbd").length, `${where} kbd`);
      }
    }
  });

  test(`${id}: protected terms survive translation`, () => {
    for (const [path, leaf] of translated) {
      const source = variants(englishLeaves.get(path) ?? "")[0];
      for (const text of variants(leaf)) {
        for (const term of GLOSSARY.terms.filter((t) => matchesTerm(source, t))) {
          assert.ok(matchesTerm(text, term), `${id}:${path} lost "${term}"`);
        }
        for (const noun of GLOSSARY.nouns.filter((n) => matchesNoun(source, n))) {
          assert.ok(matchesNoun(text, noun), `${id}:${path} lost "${noun}"`);
        }
      }
    }
  });

  test(`${id}: nothing left in English by mistake`, () => {
    const untranslated = [...translated]
      .filter(([path, leaf]) => leaf === englishLeaves.get(path) && !SAME_AS_ENGLISH.has(path))
      .map(([path]) => path);
    assert.deepEqual(untranslated, []);
  });
}

for (const locale of LOCALES) {
  test(`${locale.id}: resolves, and fits the SERP budgets`, () => {
    const options = { vars: varsFor(locale), pluralLocale: locale.htmlLang, localeId: locale.id };
    const { meta } = resolveMessages(CATALOGS[locale.id], options);
    assert.ok(displayWidth(meta.title) <= TITLE_MAX, `title is ${displayWidth(meta.title)} wide`);
    assert.ok(
      displayWidth(meta.description) <= DESCRIPTION_MAX,
      `description is ${displayWidth(meta.description)} wide`,
    );
  });
}

test("fr: high punctuation and guillemets take a narrow no-break space", () => {
  const nbsp = String.fromCodePoint(0xa0);
  const nnbsp = String.fromCodePoint(0x202f);
  const wrongSpace = new RegExp(`[ ${nbsp}][:;!?»]|«[ ${nbsp}]`);
  const missingSpace = new RegExp(`[\\p{L}\\d)][;!?»]|[\\p{L})]:(?=\\s|$)|«[^${nnbsp}]`, "u");
  const offences = leaves(CATALOGS.fr)
    .flatMap(([path, leaf]) => variants(leaf).map((text) => [path, text]))
    .flatMap(([path, text]) =>
      parseRich(text)
        .filter((token) => token.kind === "text")
        .filter((token) => wrongSpace.test(token.value) || missingSpace.test(token.value))
        .map((token) => `${path}: ${token.value}`),
    );
  assert.deepEqual(offences, []);
});

const occurrences = (text, char) => text.split(char).length - 1;
const unpaired = (opening, closing) => (text) =>
  occurrences(text, opening) !== occurrences(text, closing);
const matching = (pattern) => (text) => pattern.test(text);

/**
 * Han directly against a Latin word, a digit, a placeholder, a code span or a
 * key cap. Code spans and key caps count as one Latin run whatever their
 * content (a key name may be translated: [[空格]]); strong markers are
 * transparent.
 */
function hanTouchesLatin(text) {
  const flattened = text.replace(/`[^`]*`|\[\[.*?\]\]/g, "x").replaceAll("**", "");
  return /\p{Script=Han}[\p{Script=Latin}\d{]|[\p{Script=Latin}\d}]\p{Script=Han}/u.test(flattened);
}
/** A Latin full stop ending a sentence ("Node.js" and ".NET" are not sentence ends). */
const FULL_STOP = /\.(?=\s|$)/u;

/**
 * The register rules of docs/development/website.md that a machine can check,
 * as named defects per locale. meta.keywords is a comma-separated list for
 * crawlers, not prose, so it is exempt.
 */
const REGISTER_DEFECTS = {
  es: [
    ["a question without its opening ¿", unpaired("¿", "?")],
    ["an exclamation without its opening ¡", unpaired("¡", "!")],
  ],
  zh: [
    ["Han touching a Latin word, digit or code without a space", hanTouchesLatin],
    ["half-width punctuation after Han", matching(/\p{Script=Han}[,.;:?!()]/u)],
  ],
  hi: [["a full stop instead of the danda", matching(FULL_STOP)]],
  bn: [["a full stop instead of the danda", matching(FULL_STOP)]],
  ar: [
    ["a Latin comma, semicolon or question mark", matching(/\p{Script=Arabic}\p{M}*[,;?]/u)],
  ],
};

for (const [id, defects] of Object.entries(REGISTER_DEFECTS)) {
  test(`${id}: punctuation and spacing follow the language's register`, () => {
    const offences = leaves(CATALOGS[id])
      .filter(([path]) => path !== "meta.keywords")
      .flatMap(([path, leaf]) => variants(leaf).map((text) => [path, text]))
      .flatMap(([path, text]) =>
        defects.filter(([, isDefect]) => isDefect(text)).map(([defect]) => `${path}: ${defect}`),
      );
    assert.deepEqual(offences, []);
  });
}

test("ar: the counted noun agrees with the provider count", () => {
  const arabic = LOCALES.find((locale) => locale.id === "ar");
  const accentFor = (count) => {
    const vars = { ...varsFor(arabic), providers: String(count) };
    const options = { vars, pluralLocale: arabic.htmlLang, localeId: arabic.id };
    return resolveMessages(CATALOGS.ar, options).hero.title.accent;
  };
  assert.equal(accentFor(103), "103 مصادر");
  assert.equal(accentFor(153), "153 مصدرًا");
  assert.equal(accentFor(200), "200 مصدر");
});

test("every provider domain of the registry has a label", () => {
  const labels = Object.keys(english.coverage.domains);
  assert.deepEqual(Object.keys(providersByDomain).filter((domain) => !labels.includes(domain)), []);
});

test("the allowlist only names keys that exist", () => {
  for (const path of SAME_AS_ENGLISH) assert.ok(englishLeaves.has(path), path);
});
