/**
 * The terminal demo shows the real interface: a drift detector between the
 * scenes (src/data/scenes/) and the CLI's sources (../src/). It fails when a
 * mock shows a label, a key hint or a mark the TUI does not write, a sidebar
 * the menu does not build, or a provider the registry does not register.
 *
 * Out of its reach on purpose: layout, colours, the order of the key hints,
 * and the numbers (versions, counts, clocks), which are sample data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry } from "../../build/facts/read-registry.mjs";
import { APP_SCENE } from "../../src/data/scenes/app-scene.js";
import { JSON_SCENE } from "../../src/data/scenes/json-scene.js";
import { TUI_GLYPHS } from "../../src/data/scenes/tui-glyphs.js";
import { UPDATE_SCENE } from "../../src/data/scenes/update-scene.js";
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

/** `counted(n, "one", "many")` in fr-format: a number then the word agreeing with it. */
const COUNTED_CALL = /\bcounted\([^"]*?,\s*"([^"]+)",\s*"([^"]+)"\)/gu;
const COUNTED_TEXT = /^\d+ (.+)$/u;

/**
 * What the TUI can write: every string literal under src/ui/, and every
 * template literal as a pattern whose interpolations take a number or a text
 * the TUI writes elsewhere (a glyph, a label constant). Both are split at the
 * separator, so one hint of a composed hint bar is found on its own. A count
 * written by `counted()` ("47 détectés") is a number and one of its words.
 */
class Vocabulary {
  texts = new Set();
  patterns = [];
  countedWords = new Set();

  constructor(sources) {
    for (const literal of sources.flatMap((source) => tsLiterals(source))) {
      const joined = literal.kind === "string" ? literal.text : literal.parts.join(HOLE);
      if (literal.kind === "string") this.texts.add(literal.text.trim());
      for (const fragment of joined.split(SEPARATOR).map((part) => part.trim())) {
        if (!fragment.includes(HOLE)) this.texts.add(fragment);
        else if (fragment.replaceAll(HOLE, "").trim()) this.patterns.push(patternOf(fragment));
      }
    }
    for (const [, one, many] of sources.flatMap((source) => [...source.matchAll(COUNTED_CALL)])) {
      this.countedWords.add(one).add(many);
    }
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

const vocabulary = new Vocabulary(typescriptUnder("src/ui").map((file) => read(file)));
const unknown = (texts) =>
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

test("the vocabulary tells the TUI's words from words it never writes", () => {
  assert.ok(vocabulary.has("a tout cocher"));
  assert.ok(vocabulary.has("entrée mettre à jour (12)"));
  assert.ok(vocabulary.has("Entrée  Mettre à jour (3)"), "a label constant interpolated");
  assert.ok(!vocabulary.has("a tout sélectionner"));
  assert.ok(!vocabulary.has("entrée lancer (3)"));
  assert.ok(!vocabulary.has("Mettre à jour maintenant (3)"));
  assert.ok(vocabulary.has("47 détectés"), "a count written by counted()");
  assert.ok(!vocabulary.has("47 trouvés"));
});

/**
 * A view definition's label, `CONST` or `CONST.key`, resolved in src/ui/text/
 * in French, the mocks' language: a localized catalog (`localized({ en, fr })`)
 * is read from its `fr` block.
 */
function resolveLabel(expression) {
  const [name, key] = expression.split(".");
  for (const file of typescriptUnder("src/ui/text")) {
    const source = read(file);
    const start = source.search(new RegExp(`export const ${name}\\b`));
    if (start === -1) continue;
    const end = key ? source.indexOf("\n}", start) : source.length;
    const declaration = source.slice(start, end);
    const french = declaration.slice(Math.max(0, declaration.search(/\bfr:\s*\{/)));
    const value = key ? `\\b${key}:\\s*"([^"]*)"` : `^export const ${name}\\s*=\\s*"([^"]*)"`;
    const found = french.match(new RegExp(value));
    if (found) return found[1];
  }
  throw new Error(`no string constant ${expression} under src/ui/text/`);
}

/** A registered view's sidebar entry, from its definition in src/ui/views/. */
function sidebarEntryOf(viewFile) {
  const source = read(join("src/ui/views", `${viewFile}.ts`));
  const field = (name, pattern) => source.match(new RegExp(`\\b${name}: (${pattern}),`))?.[1];
  const label = field("label", "[A-Za-z_.]+");
  const order = field("order", "\\d+");
  const group = field("group", "\\d+");
  assert.ok(label && order && group, `${viewFile}.ts: label, order and group as literals`);
  return { label: resolveLabel(label), order: Number(order), group: Number(group) };
}

/** The sidebar gup builds: the views menu-views.ts registers, by group and order, then Quitter. */
function tuiSidebar() {
  const viewImport = /"\.\.\/ui\/views\/([\w-]+)\.js"/g;
  const registered = [...read("src/commands/menu-views.ts").matchAll(viewImport)];
  const views = registered
    .map(([, file]) => sidebarEntryOf(file))
    .sort((a, b) => a.group - b.group || a.order - b.order);
  const quitGroup = Number(read("src/ui/app/sidebar.ts").match(/const QUIT_GROUP = (\d+);/)[1]);
  const entries = [...views, { label: resolveLabel("MENU_LABELS.quit"), group: quitGroup }];
  return entries.map(({ label, group }, index) => ({
    label,
    startsGroup: index > 0 && group !== entries[index - 1].group,
  }));
}

test("the Interface mock's sidebar is the one the menu builds", () => {
  const shown = APP_SCENE.sidebar.map(({ label, startsGroup }) => ({
    label,
    startsGroup: startsGroup === true,
  }));
  assert.deepEqual(shown, tuiSidebar());
  const current = APP_SCENE.sidebar.filter((item) => item.isCurrent).map((item) => item.label);
  assert.deepEqual(current, [APP_SCENE.panelTitle]);
});

test("every label, fact, heading and key hint of the mocks is the TUI's", () => {
  const { columns, selection } = APP_SCENE;
  const shown = [
    ...APP_SCENE.facts,
    APP_SCENE.sidebarTitle,
    APP_SCENE.panelTitle,
    ...Object.values(columns),
    selection.count,
    selection.button,
    ...APP_SCENE.hints,
    ...UPDATE_SCENE.facts,
    UPDATE_SCENE.panelTitle,
    ...UPDATE_SCENE.hints,
  ];
  assert.deepEqual(unknown(shown), []);
});

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
  assert.deepEqual(unknown(marks), []);
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
    ...APP_SCENE.groups.map((group) => group.provider),
    ...UPDATE_SCENE.rows.map((row) => row.provider),
    UPDATE_SCENE.pane.provider,
  ];
  assert.deepEqual(shownNames.filter((name) => !names.has(name)), []);
  const json = JSON_SCENE.lines.map((line) => line.map((segment) => segment.t).join("")).join("\n");
  const shownIds = [...json.matchAll(/"providerId"\s*:\s*"([^"]+)"/g)].map(([, id]) => id);
  assert.ok(shownIds.length > 0);
  assert.deepEqual(shownIds.filter((id) => !ids.has(id)), []);
});
