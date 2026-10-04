import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemap } from "../../build/seo/sitemap.mjs";
import { LINKS } from "../../src/data/links.js";
import { syntheticPages } from "../helpers/fixture-pages.mjs";

const pages = syntheticPages();
const xml = buildSitemap(pages);
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => body);

test("one <url> per page, each with every alternate and x-default", () => {
  assert.equal(entries.length, pages.length);
  for (const body of entries) {
    const links = [...body.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)];
    assert.equal(links.length, pages.length + 1);
    assert.deepEqual(
      links.find(([, hreflang]) => hreflang === "x-default")?.[2],
      LINKS.siteUrl,
    );
  }
});

test("every page URL is listed once, with a day-precision lastmod and its card", () => {
  for (const page of pages) {
    const body = entries.find((entry) => entry.includes(`<loc>${page.url}</loc>`));
    assert.ok(body, page.url);
    assert.match(body, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.ok(body.includes(`<image:loc>${page.ogImage.url}</image:loc>`));
  }
});

test("declares the sitemap, xhtml and image namespaces", () => {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  for (const ns of ["sitemap/0.9", "1999/xhtml", "sitemap-image/1.1"]) assert.ok(xml.includes(ns), ns);
});

test("URLs are XML-escaped", () => {
  const [page] = pages;
  const odd = buildSitemap([{ ...page, url: "https://example.test/?a=1&b=<2>" }]);
  assert.ok(odd.includes("<loc>https://example.test/?a=1&amp;b=&lt;2&gt;</loc>"));
});
