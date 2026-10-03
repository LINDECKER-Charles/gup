import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHead } from "../../build/seo/head.mjs";
import { LINKS } from "../../src/data/links.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { realPages, syntheticPages, withMessages } from "../helpers/fixture-pages.mjs";

const count = (text, needle) => text.split(needle).length - 1;
const attr = (html, selector) => html.match(selector)?.[1];

for (const page of realPages()) {
  const head = buildHead(page);
  const label = page.locale.id;

  test(`${label}: one title, the localized description and a self canonical`, () => {
    assert.equal(count(head, "<title>"), 1);
    assert.ok(head.includes(`<title>${page.messages.meta.title}</title>`));
    assert.equal(attr(head, /<link rel="canonical" href="([^"]+)">/), page.url);
  });

  test(`${label}: one alternate per locale plus x-default → the default home`, () => {
    const alternates = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)];
    assert.equal(alternates.length, LOCALES.length + 1);
    const xDefault = alternates.find(([, hreflang]) => hreflang === "x-default");
    assert.equal(xDefault?.[2], LINKS.siteUrl);
    for (const locale of LOCALES) {
      assert.ok(alternates.some(([, hreflang]) => hreflang === locale.hreflang), locale.id);
    }
  });

  test(`${label}: Open Graph locale with every other locale as an alternate`, () => {
    assert.equal(attr(head, /property="og:locale" content="([^"]+)"/), page.locale.ogLocale);
    assert.equal(count(head, 'property="og:locale:alternate"'), LOCALES.length - 1);
    assert.equal(attr(head, /property="og:image" content="([^"]+)"/), page.ogImage.url);
    assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image">'));
  });

  test(`${label}: Search Console verification and a parseable JSON-LD block`, () => {
    assert.ok(head.includes('name="google-site-verification"'));
    const json = attr(head, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.doesNotThrow(() => JSON.parse(json));
  });
}

test("Latin pages preload three faces, other scripts only the mono face", () => {
  for (const page of syntheticPages()) {
    const preloads = [...buildHead(page).matchAll(/<link rel="preload" href="([^"]+)"/g)];
    const expected = page.locale.script === "latin" ? 3 : 1;
    assert.equal(preloads.length, expected, page.locale.id);
    assert.ok(preloads.some(([, href]) => href.endsWith("geist-mono-latin-wght-normal.woff2")));
  }
});

test("hostile catalog strings cannot break out of the head", () => {
  const [page] = realPages();
  const hostile = '"><script>alert(1)</script>\'&';
  const head = buildHead(
    withMessages(page, {
      meta: { title: hostile, description: hostile, ogTitle: hostile },
      faq: { items: { ...page.messages.faq.items, replace: { q: hostile, a: "</script>" } } },
    }),
  );
  assert.ok(!head.includes("<script>alert"));
  assert.ok(head.includes("<title>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&#39;&amp;</title>"));
  assert.equal(count(head, "</script>"), 1, "only the JSON-LD block closes a script");
});
