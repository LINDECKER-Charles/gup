/**
 * The schema.org @graph of one locale's page.
 *
 * One graph of cross-referenced nodes rather than loose top-level objects, so
 * an engine resolves a single entity described from several angles. The
 * Person, WebSite, SoftwareApplication and SoftwareSourceCode nodes share
 * site-wide @ids across locales; WebPage and FAQPage are per page.
 *
 * The FAQPage is generated from the same catalog entries the page renders in
 * its visible <details> list — structured data must describe visible content.
 *
 * Deliberately absent: BreadcrumbList (every item would be a fragment of one
 * URL), HowTo (rich result retired by Google in 2023), SearchAction (the site
 * has no search), and SoftwareApplication.mainEntityOfPage (its shared @id
 * would point at a different page in every locale).
 *
 * @typedef {import("../page-context.mjs").PageContext} PageContext
 */
import { facts } from "../../src/data/facts.js";
import { LINKS } from "../../src/data/links.js";
import { STRUCTURE } from "../../src/data/structure.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { parseRich } from "../../src/i18n/parse-rich.js";

const DATE_PUBLISHED = "2026-05-15";
const LICENSE = "https://spdx.org/licenses/MIT.html";
const SITE_NAME = "gup — Global Updater";

const id = (fragment) => ({ "@id": `${LINKS.siteUrl}#${fragment}` });
const plainText = (text) => parseRich(text).map((token) => token.value).join("");

function person() {
  return {
    "@type": "Person",
    ...id("person"),
    name: "Charles Lindecker",
    url: LINKS.author,
    sameAs: [LINKS.author, LINKS.npmProfile, LINKS.kofi],
  };
}

function webSite(page) {
  return {
    "@type": "WebSite",
    ...id("website"),
    url: LINKS.siteUrl,
    name: SITE_NAME,
    alternateName: "gup",
    description: page.messages.meta.description,
    inLanguage: LOCALES.map((locale) => locale.htmlLang),
    publisher: id("person"),
    license: LICENSE,
  };
}

function webPage(page) {
  const { meta } = page.messages;
  return {
    "@type": "WebPage",
    "@id": `${page.url}#webpage`,
    url: page.url,
    name: meta.title,
    description: meta.description,
    isPartOf: id("website"),
    about: id("software"),
    inLanguage: page.locale.htmlLang,
    datePublished: DATE_PUBLISHED,
    dateModified: page.modified,
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: page.ogImage.url,
      contentUrl: page.ogImage.url,
      width: page.ogImage.width,
      height: page.ogImage.height,
      caption: page.ogImage.alt,
    },
  };
}

function softwareFacts() {
  return {
    name: "gup",
    alternateName: ["Global Updater", "gup CLI", facts.packageName],
    url: LINKS.siteUrl,
    downloadUrl: LINKS.npm,
    installUrl: LINKS.npm,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Package Manager",
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: facts.version,
    softwareRequirements: `Node.js >= ${facts.nodeEngine}`,
    releaseNotes: LINKS.resources.releases,
    license: LICENSE,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };
}

function softwareApplication(page) {
  const { meta, features, footer } = page.messages;
  return {
    "@type": "SoftwareApplication",
    ...id("software"),
    ...softwareFacts(),
    softwareHelp: { "@type": "CreativeWork", url: LINKS.resources.cli, name: footer.links.cli },
    description: meta.ogDescription,
    keywords: meta.keywords,
    featureList: STRUCTURE.features.map(({ id: feature }) => {
      const item = features.items[feature];
      return `${plainText(item.title)} — ${plainText(item.text)}`;
    }),
    image: page.ogImage.url,
    author: id("person"),
    maintainer: id("person"),
    publisher: id("person"),
  };
}

function sourceCode() {
  return {
    "@type": "SoftwareSourceCode",
    ...id("source"),
    name: "gup source code",
    codeRepository: LINKS.repo,
    programmingLanguage: "TypeScript",
    runtimePlatform: `Node.js >= ${facts.nodeEngine}`,
    license: LICENSE,
    author: id("person"),
    targetProduct: id("software"),
  };
}

function faqPage(page) {
  const { items } = page.messages.faq;
  return {
    "@type": "FAQPage",
    "@id": `${page.url}#faq`,
    isPartOf: { "@id": `${page.url}#webpage` },
    inLanguage: page.locale.htmlLang,
    mainEntity: STRUCTURE.faq.map((question) => ({
      "@type": "Question",
      name: plainText(items[question].q),
      acceptedAnswer: { "@type": "Answer", text: plainText(items[question].a) },
    })),
  };
}

/**
 * @param {PageContext} page
 * @returns {{ "@context": string, "@graph": object[] }}
 */
export function buildGraph(page) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      person(),
      webSite(page),
      webPage(page),
      softwareApplication(page),
      sourceCode(),
      faqPage(page),
    ],
  };
}
