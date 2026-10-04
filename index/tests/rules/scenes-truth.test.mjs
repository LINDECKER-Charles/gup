/**
 * The terminal demo shows the real interface: a drift detector between the
 * scenes (src/data/scenes/) and the CLI's sources (../src/). It fails when a
 * mock shows a label, a key hint or a mark the TUI does not write, a sidebar
 * the menu does not build, or a provider the registry does not register — or
 * when the mocks do not speak exactly the languages the interface speaks.
 *
 * Each variant is read in its own language: the English mocks against the
 * `en` blocks of the TUI's catalogs (`localized({ en, fr })`), the French ones
 * against the `fr` blocks. Outside the catalogs, only what carries no word is
 * every language's: marks, punctuation, single-key names, the templates that
 * put a language's words together.
 *
 * Out of its reach on purpose: layout, colours, the order of the key hints,
 * the numbers (versions, counts, clocks), which are sample data, and the
 * words the site gives screen readers for the marks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry } from "../../build/facts/read-registry.mjs";
import { LOCALES } from "../../src/i18n/locales.js";
import { APP_SCENES } from "../../src/data/scenes/app-scene.js";
import {
  INTERFACE_LANGUAGES,
  interfaceLanguageOf,
} from "../../src/data/scenes/interface-languages.js";
import { JSON_SCENE } from "../../src/data/scenes/json-scene.js";
import { TUI_GLYPHS } from "../../src/data/scenes/tui-glyphs.js";
import { UPDATE_SCENES } from "../../src/data/scenes/update-scene.js";
import { splitByLanguage } from "../helpers/ts-catalogs.mjs";
import { tsLiterals } from "../helpers/ts-literals.mjs";

const CLI = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path) => readFileSync(join(CLI, path), "utf8");
const typescriptUnder = (dir) =>
  readdirSync(join(CLI, dir), { recursive: true })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(dir, file));

/** The TUI's hint bar and title-bar facts join their items with it. */
const SEPARATOR = " · ";
const HOLE = "\u0000";
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Sample data, never vocabulary: versions, counts, clocks. */
const isNumeric = (text) => /\d/.test(text) && /^[\d\s.,:/()+-]+$/.test(text);
/** Two letters in a row: a word, which is one language's. A key name (`p`) is not one. */
const WORD = /\p{L}{2}/u;
const hasWord = (literal) =>
  WORD.test(literal.kind === "string" ? literal.text : literal.parts.join(" "));

/** `counted(n, "one", "many")`: a number then the word agreeing with it. */
const COUNTED_CALL = /\bcounted\([^"]*?,\s*"([^"]+)",\s*"([^"]+)"\)/gu;
const COUNTED_TEXT = /^\d+ (.+)$/u;

/**
 * @typedef {{ literals: import("../helpers/ts-literals.mjs").Literal[],
 *   counted: string[] }} Words
 *   What some sources write: their literals, and the words they pass to `counted()`.
 */

/** @param {readonly string[]} sources @returns {Words} */
const wordsOf = (sources) => ({
  literals: sources.flatMap((source) => tsLiterals(source)),
  counted: sources.flatMap((source) =>
    [...source.matchAll(COUNTED_CALL)].flatMap(([, one, many]) => [one, many]),
  ),
});

/**
 * What the TUI can write: every string literal it is given, and every
 * template literal as a pattern whose interpolations take a number or a text
 * the TUI writes elsewhere (a glyph, a label constant). Both are split at the
 * separator, so one hint of a composed hint bar is found on its own. A count
 * written by `counted()` ("47 detected") is a number and one of its words.
 */
class Vocabulary {
  texts = new Set();
  patterns = [];
  countedWords;

  /** @param {Words} words */
  constructor({ literals, counted }) {
    for (const literal of literals) {
      const joined = literal.kind === "string" ? literal.text : literal.parts.join(HOLE);
      if (literal.kind === "string") this.texts.add(literal.text.trim());
      for (const fragment of joined.split(SEPARATOR).map((part) => part.trim())) {
        if (!fragment.includes(HOLE)) this.texts.add(fragment);
        else if (fragment.replaceAll(HOLE, "").trim()) this.patterns.push(patternOf(fragment));
      }
    }
    this.countedWords = new Set(counted);
  }

  has(text) {
    if (this.isValue(text) || this.isCounted(text)) return true;
    return this.patterns.some((pattern) => {
      const match = text.match(pattern);
      return match !== null && match.slice(1).every((value) => this.isValue(value));
    });
  }

  isValue(text) {
    return isNumeric(text) || this.texts.has(text.trim());
  }

  isCounted(text) {
    const words = text.trim().match(COUNTED_TEXT)?.[1];
    return words !== undefined && this.countedWords.has(words);
  }
}

const patternOf = (fragment) =>
  new RegExp(`^${fragment.split(HOLE).map(escapeRegExp).join("(.+?)")}$`, "u");

const catalogs = typescriptUnder("src/ui").map((file) => splitByLanguage(read(file)));
/** The languages of the TUI's catalogs: the languages gup speaks. */
const TUI_LANGUAGES = [...new Set(catalogs.flatMap(({ byLanguage }) => [...byLanguage.keys()]))];
const outsideCatalogs = wordsOf(catalogs.map(({ shared }) => shared)).literals;
/** What the TUI writes outside its catalogs, words left out: what every language shares. */
const SHARED = { literals: outsideCatalogs.filter((literal) => !hasWord(literal)), counted: [] };

/** @param {string} language */
function vocabularyIn(language) {
  const own = wordsOf(catalogs.flatMap(({ byLanguage }) => byLanguage.get(language) ?? []));
  return new Vocabulary({ literals: [...SHARED.literals, ...own.literals], counted: own.counted });
}

const VOCABULARIES = Object.fromEntries(
  TUI_LANGUAGES.map((language) => [language, vocabularyIn(language)]),
);
const unknownIn = (vocabulary, texts) =>
  texts.flatMap((text) => text.split(SEPARATOR)).filter((part) => !vocabulary.has(part));

test("the literal reader keeps strings and templates, never comments or regexes", () => {
  const source = '// "a"\nconst b = "b" + `c${"d"}e`; /* "f" */ const g = /"g"/u;';
  const literals = tsLiterals(source);
  assert.deepEqual(literals, [
    { kind: "string", text: "b" },
    { kind: "string", text: "d" },
    { kind: "template", parts: ["c", "e"] },
  ]);
});

test("the catalog reader tells each language's blocks from what they share", () => {
  const source = [
    'const KEY = "p";',
    "export const A = localized<Words>({",
    '  en: { quit: "Quit", hint: `${KEY} schedule`, list: ["a", "b"] },',
    '  fr: barIn({ quit: "Quitter /* } */" }),',
    "});",
    'const b = localize({ en: "yes", fr: "oui" }); // localized({ en: "no" })',
  ].join("\n");
  const { shared, byLanguage } = splitByLanguage(source);
  const literalsOf = (texts) => texts.flatMap((text) => tsLiterals(text));
  assert.deepEqual(literalsOf([shared]), [{ kind: "string", text: "p" }]);
  assert.deepEqual(literalsOf(byLanguage.get("en")), [
    { kind: "string", text: "Quit" },
    { kind: "template", parts: ["", " schedule"] },
    { kind: "string", text: "a" },
    { kind: "string", text: "b" },
    { kind: "string", text: "yes" },
  ]);
  assert.deepEqual(literalsOf(byLanguage.get("fr")), [
    { kind: "string", text: "Quitter /* } */" },
    { kind: "string", text: "oui" },
  ]);
});

test("each language's vocabulary has its own words, never another language's", () => {
  const { en, fr } = VOCABULARIES;
  assert.ok(fr.has("a tout cocher"));
  assert.ok(fr.has("entrée mettre à jour (12)"));
  assert.ok(fr.has("Entrée  Mettre à jour (3)"), "a label constant interpolated");
  assert.ok(fr.has("p planifier"), "a key constant interpolated");
  assert.ok(fr.has("47 détectés"), "a count written by counted()");
  assert.ok(!fr.has("a tout sélectionner"));
  assert.ok(!fr.has("entrée lancer (3)"));
  assert.ok(!fr.has("47 trouvés"));
  assert.ok(en.has("enter update (12)"));
  assert.ok(en.has("Enter  Update (3)"));
  assert.ok(en.has("47 detected"));
  assert.ok(!en.has("entrée mettre à jour (3)"), "a French hint is no English one");
  assert.ok(!en.has("Entrée  Mettre à jour (3)"));
  assert.ok(!en.has("47 détectés"));
  assert.ok(!fr.has("Enter  Update (3)"), "an English label is no French one");
  assert.ok(!fr.has("Current"), "a word written outside the catalogs is no language's");
});

test("the mocks speak the languages of the interface, and only those", () => {
  assert.deepEqual([...INTERFACE_LANGUAGES].sort(), [...TUI_LANGUAGES].sort());
  for (const scenes of [APP_SCENES, UPDATE_SCENES]) {
    assert.deepEqual(Object.keys(scenes).sort(), [...INTERFACE_LANGUAGES].sort());
    for (const [language, scene] of Object.entries(scenes)) assert.equal(scene.lang, language);
  }
});

test("a page shows the interface in its own language when gup speaks it, else in English", () => {
  const shown = Object.fromEntries(LOCALES.map(({ id }) => [id, interfaceLanguageOf(id)]));
  assert.deepEqual(shown, {
    en: "en",
    zh: "en",
    hi: "en",
    es: "en",
    ar: "en",
    fr: "fr",
    bn: "en",
    pt: "en",
  });
});

/**
 * A view definition's label, `CONST.key` (or a plain string `CONST`), resolved
 * in src/ui/text/ in one language: a catalog's key is read from that
 * language's block of the declaration.
 */
function resolveLabel(expression, language) {
  const [name, key] = expression.split(".");
  for (const file of typescriptUnder("src/ui/text")) {
    const source = read(file);
    const start = source.search(new RegExp(`export const ${name}\\b`));
    if (start === -1) continue;
    const next = source.indexOf("\nexport ", start + 1);
    const declaration = source.slice(start, next === -1 ? undefined : next);
    const block = key ? splitByLanguage(declaration).byLanguage.get(language)?.[0] : declaration;
    const value = key ? `\\b${key}:\\s*"([^"]*)"` : `^export const ${name}\\s*=\\s*"([^"]*)"`;
    const found = block?.match(new RegExp(value));
    if (found) return found[1];
  }
  throw new Error(`no ${language} string for ${expression} under src/ui/text/`);
}

/** A field, or a getter returning a constant: `label: X,` or `get label() { return X; }`. */
const LABEL = /\blabel: ([A-Za-z_.]+),|\bget label\(\) \{\s*return ([A-Za-z_.]+);/;

/** A registered view's sidebar entry, from its definition in src/ui/views/. */
function viewEntryOf(viewFile) {
  const source = read(join("src/ui/views", `${viewFile}.ts`));
  const field = (name) => source.match(new RegExp(`\\b${name}: (\\d+),`))?.[1];
  const [, label, gotLabel] = source.match(LABEL) ?? [];
  const [order, group] = [field("order"), field("group")];
  assert.ok((label ?? gotLabel) && order && group, `${viewFile}.ts: label, order and group`);
  return { label: label ?? gotLabel, order: Number(order), group: Number(group) };
}

/** The menu's entries: the views menu-views.ts registers, by group and order, then Quit. */
function tuiMenu() {
  const viewImport = /"\.\.\/ui\/views\/([\w-]+)\.js"/g;
  const registered = [...read("src/commands/menu-views.ts").matchAll(viewImport)];
  const views = registered
    .map(([, file]) => viewEntryOf(file))
    .sort((a, b) => a.group - b.group || a.order - b.order);
  const sidebar = read("src/ui/app/sidebar.ts");
  const quit = sidebar.match(/\bid: QUIT, label: ([A-Za-z_.]+),/)[1];
  const quitGroup = Number(sidebar.match(/const QUIT_GROUP = (\d+);/)[1]);
  return [...views, { label: quit, group: quitGroup }];
}

/** The sidebar gup builds in one language. */
function tuiSidebar(language) {
  const entries = tuiMenu();
  return entries.map(({ label, group }, index) => ({
    label: resolveLabel(label, language),
    startsGroup: index > 0 && group !== entries[index - 1].group,
  }));
}

for (const language of INTERFACE_LANGUAGES) {
  const app = APP_SCENES[language];
  const update = UPDATE_SCENES[language];

  test(`${language}: the Interface mock's sidebar is the one the menu builds`, () => {
    const shown = app.sidebar.map(({ label, startsGroup }) => ({
      label,
      startsGroup: startsGroup === true,
    }));
    assert.deepEqual(shown, tuiSidebar(language));
    const current = app.sidebar.filter((item) => item.isCurrent).map((item) => item.label);
    assert.deepEqual(current, [app.panelTitle]);
  });

  test(`${language}: every label, fact, heading and key hint of the mocks is the TUI's`, () => {
    const shown = [
      ...app.facts,
      app.sidebarTitle,
      app.panelTitle,
      ...Object.values(app.columns),
      app.selection.count,
      app.selection.button,
      ...app.hints,
      ...update.facts,
      update.panelTitle,
      ...update.hints,
    ];
    assert.deepEqual(unknownIn(VOCABULARIES[language], shown), []);
  });
}

test("the mocks draw the TUI's marks", () => {
  const glyphs = read("src/ui/theme/glyphs.ts");
  const block = glyphs.slice(glyphs.indexOf("export const STATUS_GLYPHS"));
  const statusGlyph = (name) => block.match(new RegExp(`\\b${name}: "([^"]+)"`))?.[1];
  const spinner = block.match(/\brunning: Object\.freeze\(\[([^\]]+)\]\)/)[1];
  for (const [name, glyph] of Object.entries(TUI_GLYPHS.status)) {
    if (name === "running") assert.ok(spinner.includes(`"${glyph}"`), "spinner frame");
    else assert.equal(glyph, statusGlyph(name), name);
  }
  const marks = [...Object.values(TUI_GLYPHS.box), TUI_GLYPHS.cursor, TUI_GLYPHS.current];
  assert.deepEqual(unknownIn(new Vocabulary(SHARED), marks), []);
});

/** Display names of the providers ALL_PROVIDERS registers. */
function registeredDisplayNames(registeredIds) {
  const names = new Set();
  for (const file of typescriptUnder("src/providers")) {
    const source = read(file);
    const id = source.match(/\breadonly id = "([^"]+)"/)?.[1];
    const name = source.match(/\breadonly displayName = "([^"]+)"/)?.[1];
    if (id && name && registeredIds.has(id)) names.add(name);
  }
  return names;
}

test("the mocks only show registered providers", () => {
  const registry = readRegistry(read("src/core/registry.ts"), (relative) =>
    read(`src/providers/${relative}.ts`),
  );
  const ids = new Set(Object.values(registry.providersByDomain).flat());
  const names = registeredDisplayNames(ids);
  const shownNames = [
    ...Object.values(APP_SCENES).flatMap((scene) => scene.groups.map((group) => group.provider)),
    ...Object.values(UPDATE_SCENES).flatMap((scene) => [
      ...scene.rows.map((row) => row.provider),
      scene.pane.provider,
    ]),
  ];
  assert.deepEqual(shownNames.filter((name) => !names.has(name)), []);
  const json = JSON_SCENE.lines.map((line) => line.map((segment) => segment.t).join("")).join("\n");
  const shownIds = [...json.matchAll(/"providerId"\s*:\s*"([^"]+)"/g)].map(([, id]) => id);
  assert.ok(shownIds.length > 0);
  assert.deepEqual(shownIds.filter((id) => !ids.has(id)), []);
});
