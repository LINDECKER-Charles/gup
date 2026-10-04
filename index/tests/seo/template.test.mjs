import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../../build/html/escape.mjs";
import { inlineJson } from "../../build/html/inline-json.mjs";
import { renderPage } from "../../build/html/render-page.mjs";
import { fillTemplate } from "../../build/html/template.mjs";
import { buildNotFound } from "../../build/seo/not-found.mjs";
import { installCommand } from "../../src/data/facts.js";
import { syntheticPages } from "../helpers/fixture-pages.mjs";

const TEMPLATE = `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <!--gup:head-->
  </head>
  <body>
    <div id="root"><!--gup:app--></div>
    <!--gup:body-end-->
  </body>
</html>`;

const pages = syntheticPages();
const rtl = pages.find((page) => page.locale.dir === "rtl");

test("fillTemplate replaces each slot", () => {
  assert.equal(fillTemplate("a<!--x-->b<!--y-->", { "<!--x-->": "1", "<!--y-->": "2" }), "a1b2");
});

test("fillTemplate throws on a missing or duplicated slot", () => {
  assert.throws(() => fillTemplate("ab", { "<!--x-->": "1" }), /<!--x--> found 0 time/);
  assert.throws(() => fillTemplate("<!--x--><!--x-->", { "<!--x-->": "1" }), /found 2 time/);
});

test("fillTemplate inserts values literally and never rescans them", () => {
  const slots = { "<!--x-->": "$& <!--y-->", "<!--y-->": "Y" };
  assert.equal(fillTemplate("<!--x-->|<!--y-->", slots), "$& <!--y-->|Y");
});

test("renderPage sets lang and dir, fills every slot and ships the bootstrap", () => {
  const html = renderPage({ template: TEMPLATE, page: rtl, appHtml: "<main>app</main>" });
  assert.ok(html.includes('<html lang="ar" dir="rtl">'));
  assert.ok(html.includes('<div id="root"><main>app</main></div>'));
  assert.ok(!html.includes("<!--gup:"));
  const boot = JSON.parse(html.match(/<script id="gup-boot" type="application\/json">(.*?)<\/script>/)[1]);
  assert.equal(boot.v, 1);
  assert.equal(boot.locale, "ar");
  assert.equal(boot.messages.meta, undefined, "head-only copy stays out of the payload");
  assert.equal(boot.messages.hero.title.after, rtl.messages.hero.title.after);
  assert.ok(html.includes(`<noscript><p class="noscript">${escapeHtml(rtl.messages.common.noscript)}`));
});

test("renderPage puts the CSP first in the head only when a policy is given", () => {
  const policy = "default-src 'self'";
  const secured = renderPage({ template: TEMPLATE, page: rtl, appHtml: "", policy });
  const csp = secured.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(csp > 0 && csp < secured.indexOf("<title>"));
  assert.ok(secured.includes("content=\"default-src &#39;self&#39;\""));
  const open = renderPage({ template: TEMPLATE, page: rtl, appHtml: "" });
  assert.ok(!open.includes("Content-Security-Policy"));
});

test("escapeHtml neutralises the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("inlineJson cannot close its script element and round-trips", () => {
  const value = { text: `</script><!-- & ${String.fromCodePoint(0x2028, 0x2029)}` };
  const json = inlineJson(value);
  assert.ok(!/[<>&\p{Zl}\p{Zp}]/u.test(json));
  assert.deepEqual(JSON.parse(json), value);
});

test("the 404 is English, noindex, canonical to the default home, and links every locale", () => {
  const html = buildNotFound(pages);
  const home = pages.find((page) => page.locale.isDefault);
  assert.ok(html.includes('<html lang="en" dir="ltr">'));
  assert.ok(html.includes('<meta name="robots" content="noindex, follow">'));
  assert.ok(html.includes(`<link rel="canonical" href="${home.url}">`));
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'));
  for (const page of pages) {
    assert.ok(html.includes(`href="${page.url}" hreflang="${page.locale.hreflang}"`), page.locale.id);
  }
  assert.ok(!html.includes("<script"));
});

test("the 404 gives the whole install command", () => {
  const command = buildNotFound(pages).match(/<code>(.*?)<\/code>/s)?.[1] ?? "";
  // Tags become spaces, never nothing: the words read as the browser lays them out.
  const words = command.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(words, installCommand);
});
