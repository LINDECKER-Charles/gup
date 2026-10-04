/**
 * Post-build assertions on the files in dist/, no browser: per-locale HTML
 * (lang/dir, SERP budgets, canonical, hreflang reciprocity, social card,
 * JSON-LD, bootstrap, no leaked placeholder or markup, legacy anchors, CSP,
 * size budget), then the site as a whole (sitemap, 404, legacy URLs, no
 * catalog in the client bundle, JS/CSS/font budgets).
 *
 * @typedef {import("../../build/page-context.mjs").PageContext} PageContext
 * @typedef {{ report: ReturnType<import("./report.mjs").createReport>, dist: string }} Context
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { displayWidth } from "../../build/i18n/display-width.mjs";
import { installCommand } from "../../src/data/facts.js";
import { LINKS } from "../../src/data/links.js";
import { STRUCTURE } from "../../src/data/structure.js";

const KIB = 1024;
const BUDGET = Object.freeze({
  htmlGz: 30 * KIB,
  jsGz: 62 * KIB,
  cssGz: 12 * KIB,
  latinFonts: { files: 3, bytes: 75 * KIB },
  otherFonts: { files: 1, bytes: 30 * KIB },
});
const SERP = Object.freeze({ title: 60, description: 160 });
const CARD = Object.freeze({ width: 1200, height: 630 });
const PNG_IHDR = 0x49484452;
const NODE_TYPES = [
  "Person",
  "WebSite",
  "WebPage",
  "SoftwareApplication",
  "SoftwareSourceCode",
  "FAQPage",
];
const LEAKS = [
  /\{[A-Za-z]+\}/,
  /@@[A-Z_]+@@/,
  /\bundefined\b/,
  /\[object Object\]/,
  /\*\*/,
  /\[\[|\]\]/,
];
const LEGACY_FILES = [
  "public/og-image.png",
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon-96x96.png",
  "public/apple-touch-icon.png",
  "public/site.webmanifest",
  "robots.txt",
  "llms.txt",
  "llms-full.txt",
  "sitemap.xml",
  "fonts/anton-latin-400-normal.woff2",
  "fonts/geist-latin-wght-normal.woff2",
  "fonts/geist-mono-latin-wght-normal.woff2",
];
const ALTERNATE = /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g;
const FONT_PRELOAD = /<link rel="preload" href="([^"]+)" as="font"/g;
const JSON_LD = /<script type="application\/ld\+json">(.*?)<\/script>/s;
const BOOT = /<script id="gup-boot" type="application\/json">(.*?)<\/script>/s;

const read = (file) => readFileSync(file, "utf8");
const exists = (file) => statSync(file, { throwIfNoEntry: false })?.isFile() === true;
const gz = (text) => gzipSync(text).length;
const first = (html, pattern) => html.match(pattern)?.[1];
const count = (text, needle) => text.split(needle).length - 1;
const fromSite = (dist, url) => join(dist, url.slice(LINKS.siteUrl.length));
const fromBase = (dist, href) => join(dist, href.slice(LINKS.basePath.length));

function visibleText(html) {
  const start = html.indexOf('<div id="root">');
  return html.slice(start, html.indexOf('<script id="gup-boot"')).replace(/<[^>]+>/g, " ");
}

/** Width and height from a PNG's IHDR chunk, or null if the file is not a PNG. */
function pngSize(file) {
  if (!exists(file)) return null;
  const bytes = readFileSync(file);
  if (bytes.readUInt32BE(12) !== PNG_IHDR) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** @param {Context} ctx */
function checkHead({ report, dist }, { html, page }) {
  const { id, htmlLang, dir } = page.locale;
  const { meta } = page.messages;
  const canonical = first(html, /<link rel="canonical" href="([^"]+)">/);
  const card = pngSize(fromSite(dist, page.ogImage.url));
  report.check(`${id}: <html lang dir>`, html.includes(`<html lang="${htmlLang}" dir="${dir}">`));
  report.check(`${id}: title fits the SERP`, displayWidth(meta.title) <= SERP.title, meta.title);
  report.check(`${id}: description fits`, displayWidth(meta.description) <= SERP.description);
  report.check(`${id}: canonical is its own URL`, canonical === page.url, canonical);
  report.check(`${id}: Search Console token kept`, html.includes("google-site-verification"));
  report.check(`${id}: production CSP present`, html.includes("Content-Security-Policy"));
  report.check(
    `${id}: social card is a 1200×630 PNG`,
    card?.width === CARD.width && card?.height === CARD.height,
    page.ogImage.url,
  );
}

/** @param {Context} ctx */
function checkStructuredData({ report }, { html, page }) {
  const { id } = page.locale;
  const graph = JSON.parse(first(html, JSON_LD) ?? "{}")["@graph"] ?? [];
  const nodes = Object.fromEntries(graph.map((node) => [node["@type"], node]));
  const questions = nodes.FAQPage?.mainEntity?.length ?? 0;
  const boot = JSON.parse(first(html, BOOT) ?? "{}");
  report.check(`${id}: JSON-LD has the six node types`, NODE_TYPES.every((type) => nodes[type]));
  report.check(
    `${id}: FAQPage mirrors the visible FAQ`,
    questions > 0 && questions === count(html, 'class="faq-item"'),
    `${questions} questions`,
  );
  report.check(`${id}: bootstrap names the page's locale`, boot.locale === id);
}

/** @param {Context} ctx */
function checkBody({ report }, { html, page }) {
  const { id } = page.locale;
  const text = visibleText(html);
  const leaks = LEAKS.filter((pattern) => pattern.test(text)).map(String);
  const legacy = STRUCTURE.sections.flatMap((section) => section.legacyIds);
  const missing = legacy.filter((alias) => !html.includes(`id="${alias}"`));
  report.check(`${id}: no placeholder or markup in the text`, leaks.length === 0, leaks.join(" "));
  report.check(`${id}: exactly one H1`, count(html, "<h1 ") === 1);
  // Commands render word by word (src/ui/CodeWords.jsx): compare words, not markup.
  const words = text.replace(/\s+/g, " ");
  report.check(`${id}: install command in the visible text`, words.includes(installCommand));
  report.check(`${id}: ${legacy.length} legacy anchors`, missing.length === 0, missing.join(", "));
  report.check(`${id}: HTML ≤ 30 KB gzipped`, gz(html) <= BUDGET.htmlGz, `${gz(html)} B`);
}

/** @param {Context} ctx */
function checkFontPreloads({ report, dist }, { html, page }) {
  const hrefs = [...html.matchAll(FONT_PRELOAD)].map((match) => match[1]);
  const bytes = hrefs.reduce((sum, href) => sum + statSync(fromBase(dist, href)).size, 0);
  const budget = page.locale.script === "latin" ? BUDGET.latinFonts : BUDGET.otherFonts;
  report.check(
    `${page.locale.id}: preloads ≤ ${budget.files} font(s), ${budget.bytes / KIB} KB`,
    hrefs.length <= budget.files && bytes <= budget.bytes,
    `${hrefs.length} files, ${bytes} B`,
  );
}

const PAGE_CHECKS = [checkHead, checkStructuredData, checkBody, checkFontPreloads];

/** @param {Context} ctx @param {readonly PageContext[]} pages */
function checkPages(ctx, pages) {
  const alternateSets = new Set();
  for (const page of pages) {
    const file = join(ctx.dist, page.locale.path, "index.html");
    ctx.report.check(`${page.locale.id}: page exists at /${page.locale.path}`, exists(file));
    if (!exists(file)) continue;
    const html = read(file);
    for (const run of PAGE_CHECKS) run(ctx, { html, page });
    const alternates = [...html.matchAll(ALTERNATE)].map((match) => `${match[1]} ${match[2]}`);
    alternateSets.add(alternates.sort().join("\n"));
  }
  ctx.report.check("hreflang alternates are identical on every page", alternateSets.size === 1);
}

/** @param {Context} ctx @param {readonly PageContext[]} pages */
function checkSite({ report, dist }, pages) {
  const sitemap = read(join(dist, "sitemap.xml"));
  const notFound = read(join(dist, "404.html"));
  const llms = read(join(dist, "llms.txt"));
  const missing = LEGACY_FILES.filter((file) => !exists(join(dist, file)));
  report.check(`sitemap lists the ${pages.length} pages`, count(sitemap, "<url>") === pages.length);
  report.check(
    "sitemap carries every alternate of every page",
    count(sitemap, "<xhtml:link ") === pages.length * (pages.length + 1),
  );
  report.check("404 is noindex", notFound.includes('content="noindex, follow"'));
  report.check("404 links every locale", pages.every((p) => notFound.includes(`href="${p.url}"`)));
  report.check("indexed URLs still exist", missing.length === 0, missing.join(", "));
  report.check("llms.txt lists every language", pages.every((page) => llms.includes(page.url)));
}

/** @param {Context} ctx @param {readonly PageContext[]} pages */
function checkBundle({ report, dist }, pages) {
  const files = readdirSync(join(dist, "assets")).map((name) => join(dist, "assets", name));
  const js = files.filter((file) => file.endsWith(".js")).map(read);
  const css = files.filter((file) => file.endsWith(".css")).map(read);
  const sentinels = pages.flatMap(({ messages }) => [messages.meta.title, messages.meta.ogTitle]);
  const leaked = sentinels.filter((sentinel) => js.some((code) => code.includes(sentinel)));
  const jsGz = js.reduce((sum, code) => sum + gz(code), 0);
  const cssGz = css.reduce((sum, code) => sum + gz(code), 0);
  report.check("no catalog in the client bundle", leaked.length === 0, leaked.join(" | "));
  report.check("JavaScript ≤ 62 KB gzipped", jsGz <= BUDGET.jsGz, `${jsGz} B`);
  report.check("CSS ≤ 12 KB gzipped", cssGz <= BUDGET.cssGz, `${cssGz} B`);
}

/**
 * @param {Context} ctx
 * @param {readonly PageContext[]} pages
 */
export function runStaticChecks(ctx, pages) {
  ctx.report.section("built output");
  checkPages(ctx, pages);
  checkSite(ctx, pages);
  checkBundle(ctx, pages);
}
