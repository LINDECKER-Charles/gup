/**
 * One PageContext per locale: everything the head builder, the JSON-LD graph,
 * the sitemap, the prerender and the dev server need to produce a page.
 *
 * The only place where facts (version, provider count, Node floor), locales
 * and catalogs meet. Built fresh on every call, which is what lets the dev
 * plugin pick up a catalog edit on the next request.
 *
 * @typedef {import("../src/i18n/locales.js").Locale} Locale
 * @typedef {{ readonly hreflang: string, readonly href: string }} Alternate
 *
 * @typedef {object} PageContext
 * @property {Locale} locale
 * @property {string} url                    Absolute, with a trailing slash.
 * @property {readonly Alternate[]} alternates  Every locale, then x-default.
 * @property {object} messages               Resolved catalog (meta included).
 * @property {{ url: string, width: number, height: number, alt: string }} ogImage
 * @property {string} modified               ISO timestamp of the last content change.
 *
 * @typedef {{ readonly modified: string }} BuildInfo
 * @typedef {{ readonly locales: readonly Locale[], readonly catalogs: object }} Registry
 */
import { facts, installCommand } from "../src/data/facts.js";
import { LINKS } from "../src/data/links.js";
import { LOCALES } from "../src/i18n/locales.js";
import { localeHref } from "../src/i18n/locale-href.js";
import { CATALOGS } from "./i18n/load-catalogs.mjs";
import { resolveMessages } from "./i18n/resolve-messages.mjs";

const OG_IMAGE = Object.freeze({ path: "public/og-image.png", width: 1200, height: 630 });

const duplicates = (values) => values.filter((value, i) => values.indexOf(value) !== i);

/** The registry and the catalogs must describe the same, coherent set of locales. */
function assertRegistry({ locales, catalogs }) {
  const defaults = locales.filter((locale) => locale.isDefault);
  if (defaults.length !== 1) {
    throw new Error(`locales: expected exactly one default locale, found ${defaults.length}`);
  }
  const ids = locales.map((locale) => locale.id);
  const clashes = [...duplicates(ids), ...duplicates(locales.map((locale) => locale.path))];
  if (clashes.length) throw new Error(`locales: duplicate id or path: ${clashes.join(", ")}`);
  const catalogIds = Object.keys(catalogs);
  const unmatched = [
    ...ids.filter((id) => !catalogIds.includes(id)),
    ...catalogIds.filter((id) => !ids.includes(id)),
  ];
  if (unmatched.length) {
    throw new Error(`locales: locale without catalog or catalog without locale: ${unmatched}`);
  }
}

const absoluteHref = (locale) => localeHref(locale, LINKS.origin);

function varsFor(locale, build) {
  return {
    providers: String(facts.providerCount),
    version: facts.version,
    node: String(facts.nodeMajor),
    nodeEngine: facts.nodeEngine,
    packageName: facts.packageName,
    installCommand,
    year: build.modified.slice(0, 4),
    endonym: locale.endonym,
  };
}

function alternatesOf(locales) {
  const fallback = locales.find((locale) => locale.isDefault);
  return Object.freeze([
    ...locales.map((locale) => ({ hreflang: locale.hreflang, href: absoluteHref(locale) })),
    { hreflang: "x-default", href: absoluteHref(fallback) },
  ]);
}

function pageContext(locale, { build, catalogs, alternates }) {
  const messages = resolveMessages(catalogs[locale.id], {
    vars: varsFor(locale, build),
    pluralLocale: locale.htmlLang,
    localeId: locale.id,
  });
  return Object.freeze({
    locale,
    url: absoluteHref(locale),
    alternates,
    messages,
    ogImage: {
      url: `${LINKS.siteUrl}${locale.ogImage ?? OG_IMAGE.path}`,
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
      alt: messages.meta.ogImageAlt,
    },
    modified: build.modified,
  });
}

/**
 * @param {BuildInfo} build
 * @param {Registry} [registry]  Seam for tests; the site always uses the defaults.
 * @returns {readonly PageContext[]}
 */
export function pageContexts(build, registry = { locales: LOCALES, catalogs: CATALOGS }) {
  assertRegistry(registry);
  const alternates = alternatesOf(registry.locales);
  const shared = { build, catalogs: registry.catalogs, alternates };
  return Object.freeze(registry.locales.map((locale) => pageContext(locale, shared)));
}
