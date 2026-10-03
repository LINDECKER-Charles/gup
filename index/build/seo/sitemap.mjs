/**
 * sitemap.xml: one <url> per locale, each listing every alternate (hreflang
 * reciprocity has to hold in the sitemap as well as in the heads) and its
 * social card.
 *
 * `lastmod` is the day of the last commit touching the site, not the deploy
 * date. `changefreq`, `priority` and the image title/caption are omitted:
 * Google ignores the first two and deprecated the last two.
 *
 * @typedef {import("../page-context.mjs").PageContext} PageContext
 */
import { escapeHtml } from "../html/escape.mjs";

const NAMESPACES = [
  'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  'xmlns:xhtml="http://www.w3.org/1999/xhtml"',
  'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
].join("\n        ");

const alternateLink = ({ hreflang, href }) =>
  `    <xhtml:link rel="alternate" hreflang="${escapeHtml(hreflang)}" ` +
  `href="${escapeHtml(href)}"/>`;

function urlEntry(page) {
  return [
    "  <url>",
    `    <loc>${escapeHtml(page.url)}</loc>`,
    `    <lastmod>${page.modified.slice(0, 10)}</lastmod>`,
    ...page.alternates.map(alternateLink),
    `    <image:image><image:loc>${escapeHtml(page.ogImage.url)}</image:loc></image:image>`,
    "  </url>",
  ].join("\n");
}

/**
 * @param {readonly PageContext[]} pages
 * @returns {string}
 */
export function buildSitemap(pages) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset ${NAMESPACES}>`,
    ...pages.map(urlEntry),
    "</urlset>",
    "",
  ].join("\n");
}
