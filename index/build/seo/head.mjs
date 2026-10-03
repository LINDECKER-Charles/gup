/**
 * Builds the localized part of a page's <head>: title, description,
 * canonical, hreflang alternates, Open Graph, Twitter card, font preloads and
 * the JSON-LD graph. A pure string builder — no React — so the dev server and
 * the prerender emit byte-identical heads and node:test can assert on them.
 *
 * Every catalog string passes through escapeHtml; the JSON-LD through
 * inlineJson.
 *
 * @typedef {import("../page-context.mjs").PageContext} PageContext
 */
import { LINKS } from "../../src/data/links.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { escapeHtml } from "../html/escape.mjs";
import { inlineJson } from "../html/inline-json.mjs";
import { buildGraph } from "./json-ld.mjs";

const SITE_NAME = "gup — Global Updater";
const AUTHOR = "Charles Lindecker";
const TWITTER_HANDLE = "@LINDECKERCharles";
/** Search Console ownership of the URL-prefix property. Removing it unverifies the site. */
const GOOGLE_SITE_VERIFICATION = "YsysVCbPPuBg9QDIPs77j60iMD7xcG4OUQ3yRIh6l_E";
const ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";

const FONT_FILES = Object.freeze({
  display: "anton-latin-400-normal.woff2",
  sans: "geist-latin-wght-normal.woff2",
  mono: "geist-mono-latin-wght-normal.woff2",
});
/**
 * Latin pages paint all three faces above the fold. Other scripts render their
 * text from system fonts and only need Geist Mono, for the install command.
 */
const PRELOADS_BY_SCRIPT = Object.freeze({ latin: ["display", "sans", "mono"] });
const DEFAULT_PRELOADS = Object.freeze(["mono"]);

const attributes = (attrs) =>
  Object.entries(attrs)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
const metaName = (name, content) => `<meta ${attributes({ name, content })}>`;
const metaProperty = (property, content) => `<meta ${attributes({ property, content })}>`;
const link = (attrs) => `<link ${attributes(attrs)}>`;

function primaryTags(page) {
  const { meta } = page.messages;
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    metaName("description", meta.description),
    link({ rel: "canonical", href: page.url }),
    ...page.alternates.map(({ hreflang, href }) => link({ rel: "alternate", hreflang, href })),
    metaName("robots", ROBOTS),
    metaName("google-site-verification", GOOGLE_SITE_VERIFICATION),
    metaName("author", AUTHOR),
    metaName("application-name", "gup"),
    metaProperty("article:modified_time", page.modified),
  ];
}

function openGraphTags(page) {
  const { meta } = page.messages;
  const others = LOCALES.filter((locale) => locale.id !== page.locale.id);
  return [
    metaProperty("og:site_name", SITE_NAME),
    metaProperty("og:type", "website"),
    metaProperty("og:locale", page.locale.ogLocale),
    ...others.map((locale) => metaProperty("og:locale:alternate", locale.ogLocale)),
    metaProperty("og:url", page.url),
    metaProperty("og:title", meta.ogTitle),
    metaProperty("og:description", meta.ogDescription),
    metaProperty("og:image", page.ogImage.url),
    metaProperty("og:image:type", "image/png"),
    metaProperty("og:image:width", String(page.ogImage.width)),
    metaProperty("og:image:height", String(page.ogImage.height)),
    metaProperty("og:image:alt", page.ogImage.alt),
  ];
}

function twitterTags(page) {
  const { meta } = page.messages;
  return [
    metaName("twitter:card", "summary_large_image"),
    metaName("twitter:title", meta.ogTitle),
    metaName("twitter:description", meta.description),
    metaName("twitter:image", page.ogImage.url),
    metaName("twitter:image:alt", page.ogImage.alt),
    metaName("twitter:site", TWITTER_HANDLE),
    metaName("twitter:creator", TWITTER_HANDLE),
  ];
}

function fontPreloads(page) {
  const faces = PRELOADS_BY_SCRIPT[page.locale.script] ?? DEFAULT_PRELOADS;
  return faces.map((face) =>
    link({
      rel: "preload",
      href: `${LINKS.basePath}fonts/${FONT_FILES[face]}`,
      as: "font",
      type: "font/woff2",
      crossorigin: "anonymous",
    }),
  );
}

/**
 * @param {PageContext} page
 * @returns {string}
 */
export function buildHead(page) {
  return [
    ...primaryTags(page),
    ...openGraphTags(page),
    ...twitterTags(page),
    ...fontPreloads(page),
    `<script type="application/ld+json">${inlineJson(buildGraph(page))}</script>`,
  ].join("\n    ");
}
