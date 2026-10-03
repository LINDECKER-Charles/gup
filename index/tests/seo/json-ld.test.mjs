import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../../build/seo/json-ld.mjs";
import { facts } from "../../src/data/facts.js";
import { LINKS } from "../../src/data/links.js";
import { STRUCTURE } from "../../src/data/structure.js";
import { parseRich } from "../../src/i18n/parse-rich.js";
import { syntheticPages } from "../helpers/fixture-pages.mjs";

const TYPES = [
  "Person",
  "WebSite",
  "WebPage",
  "SoftwareApplication",
  "SoftwareSourceCode",
  "FAQPage",
];
const SHARED = ["Person", "WebSite", "SoftwareApplication", "SoftwareSourceCode"];
const plain = (text) => parseRich(text).map((token) => token.value).join("");
const nodesOf = (page) =>
  Object.fromEntries(buildGraph(page)["@graph"].map((node) => [node["@type"], node]));

const pages = syntheticPages();

test("every page describes the same six node types", () => {
  for (const page of pages) assert.deepEqual(Object.keys(nodesOf(page)).sort(), [...TYPES].sort());
});

test("site-wide nodes share their @id across locales; page nodes do not", () => {
  const graphs = pages.map(nodesOf);
  for (const type of SHARED) {
    const ids = new Set(graphs.map((nodes) => nodes[type]["@id"]));
    assert.equal(ids.size, 1, type);
    assert.ok([...ids][0].startsWith(LINKS.siteUrl), type);
  }
  const pageIds = new Set(graphs.map((nodes) => nodes.WebPage["@id"]));
  assert.equal(pageIds.size, pages.length);
});

test("the FAQ mirrors the visible questions, in page order, as plain text", () => {
  for (const page of pages) {
    const { FAQPage } = nodesOf(page);
    const { items } = page.messages.faq;
    assert.deepEqual(
      FAQPage.mainEntity.map((question) => question.name),
      STRUCTURE.faq.map((id) => plain(items[id].q)),
    );
    for (const { acceptedAnswer } of FAQPage.mainEntity) {
      assert.ok(!/`|\*\*|\[\[/.test(acceptedAnswer.text), acceptedAnswer.text);
    }
  }
});

test("software facts come from the repository and the page language from the locale", () => {
  for (const page of pages) {
    const nodes = nodesOf(page);
    assert.equal(nodes.SoftwareApplication.softwareVersion, facts.version);
    assert.equal(nodes.SoftwareApplication.softwareRequirements, `Node.js >= ${facts.nodeEngine}`);
    assert.equal(nodes.SoftwareApplication.featureList.length, STRUCTURE.features.length);
    assert.equal(nodes.WebPage.inLanguage, page.locale.htmlLang);
    assert.equal(nodes.WebPage.url, page.url);
    assert.equal(nodes.FAQPage.inLanguage, page.locale.htmlLang);
    assert.equal(nodes.SoftwareApplication.mainEntityOfPage, undefined);
  }
});
