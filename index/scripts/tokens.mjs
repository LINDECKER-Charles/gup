/**
 * The double-at placeholder vocabulary of the static text assets, and the
 * substitution itself.
 *
 * llms.txt, llms-full.txt, robots.txt and site.webmanifest state the same
 * handful of facts as the page: the published version, the provider count
 * (in total and per system), the minimum Node, when the site last changed,
 * and which languages it is available in. They are written once, here, from
 * src/data/facts.js (itself generated from the repository), the locale
 * registry and the English catalog — never retyped by hand.
 * scripts/stamp-static.mjs applies them to the built copies.
 */
import { CATALOGS } from "../build/i18n/load-catalogs.mjs";
import { LINKS } from "../src/data/links.js";
import { facts, providersByDomain, providersBySystem } from "../src/data/facts.js";
import { LOCALES } from "../src/i18n/locales.js";
import { localeHref } from "../src/i18n/locale-href.js";

/** Domain labels: the English catalog is their single source. */
const DOMAIN_LABELS = CATALOGS.en.coverage.domains;

/** The full provider inventory as a markdown list, for llms-full.txt. */
function providerInventory() {
  return Object.entries(providersByDomain)
    .map(([domain, ids]) => {
      const label = DOMAIN_LABELS[domain] ?? domain;
      return `- **${label}** (${ids.length}): \`${ids.join("`, `")}\``;
    })
    .join("\n");
}

/** Every locale's home page, as a markdown list. */
function localeLinks() {
  return LOCALES.map(
    (locale) => `- ${locale.endonym} (${locale.htmlLang}): ${localeHref(locale, LINKS.origin)}`,
  ).join("\n");
}

/** @param {string} modifiedIso ISO timestamp of the last content change. */
export function buildTokens(modifiedIso) {
  return {
    "@@PROVIDERS@@": String(facts.providerCount),
    "@@PROVIDERS_WINDOWS@@": String(providersBySystem.windows),
    "@@PROVIDERS_MACOS@@": String(providersBySystem.macos),
    "@@PROVIDERS_LINUX@@": String(providersBySystem.linux),
    "@@VERSION@@": facts.version,
    "@@PACKAGE@@": facts.packageName,
    "@@NODE@@": facts.nodeEngine,
    "@@NODE_MAJOR@@": String(facts.nodeMajor),
    "@@MODIFIED@@": modifiedIso,
    "@@LASTMOD@@": modifiedIso.slice(0, 10),
    "@@PROVIDER_INVENTORY@@": providerInventory(),
    "@@LOCALE_LINKS@@": localeLinks(),
  };
}

/**
 * Replaces every token, then fails if any placeholder survived — a typo in a
 * token name must break the build rather than ship a literal "@@FOO@@".
 */
export function applyTokens(text, tokens, label) {
  let out = text;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.replaceAll(token, value);
  }
  const leftover = out.match(/@@[A-Z_]+@@/g);
  if (leftover) {
    throw new Error(
      `stamp: unresolved placeholder(s) in ${label}: ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return out;
}
