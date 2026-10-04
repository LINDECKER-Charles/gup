import { COUNTED_PAGES, REPORT_IDS as IDS, REPORT_PAGES, type ReportPage } from "./report-dom.js";
import { REPORT_LABELS as L } from "./report-labels.js";

/**
 * The report's static markup: skip link, header (title, period, search,
 * theme, print), navigation, one empty section per page, footer, the
 * package drawer, the tooltip, the live region, the `<noscript>` notice and
 * the SVG patterns the charts fill with. Every text comes from the labels
 * and goes through {@link escapeHtml}; the data never does — the client
 * builds everything data-derived from the JSON block, node by node.
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

const e = escapeHtml;

export function reportBody(): string {
  return [
    `<a class="skip-link" href="#${IDS.main}">${e(L.document.skipLink)}</a>`,
    masthead(),
    `<div class="banner" id="${IDS.banner}" role="status" hidden></div>`,
    `<main id="${IDS.main}" tabindex="-1">`,
    ...REPORT_PAGES.map(pageSection),
    "</main>",
    footer(),
    drawer(),
    `<div class="tooltip" id="${IDS.tooltip}" role="tooltip" hidden></div>`,
    `<div class="sr-only" id="${IDS.live}" aria-live="polite"></div>`,
    `<noscript><p class="noscript">${e(L.document.noscript)}</p></noscript>`,
    PATTERNS,
  ].join("\n");
}

function masthead(): string {
  return [
    '<header class="masthead">',
    '<div class="masthead-inner">',
    '<div class="brand">',
    `<span class="brand-mark" aria-hidden="true">${e(L.document.brand)}</span>`,
    `<div class="brand-text"><h1>${e(L.document.heading)}</h1>`,
    `<p class="period" id="${IDS.period}"></p></div>`,
    "</div>",
    '<div class="tools">',
    searchBox(),
    themeSwitch(),
    `<button type="button" class="button" id="${IDS.print}">${e(L.header.print)}</button>`,
    "</div>",
    "</div>",
    navigation(),
    "</header>",
  ].join("\n");
}

function searchBox(): string {
  return [
    '<div class="search-box">',
    `<label class="sr-only" for="${IDS.search}">${e(L.search.label)}</label>`,
    `<input id="${IDS.search}" type="search" placeholder="${e(L.search.placeholder)}"`,
    ' autocomplete="off" spellcheck="false">',
    `<kbd aria-hidden="true">${e(L.search.shortcut)}</kbd>`,
    "</div>",
  ].join("");
}

function themeSwitch(): string {
  const choices = Object.entries(L.header.themes).map(
    ([choice, label]) =>
      `<button type="button" data-theme-choice="${choice}" aria-pressed="false">` +
      `${e(label)}</button>`,
  );
  return [
    `<div class="theme-switch" role="group" aria-label="${e(L.header.theme)}">`,
    ...choices,
    "</div>",
  ].join("");
}

function navigation(): string {
  const items = REPORT_PAGES.map((page) => {
    const count = COUNTED_PAGES.has(page) ? ' <span class="nav-count"></span>' : "";
    return `<li><a href="#/${page}" data-nav="${page}">${e(L.nav[page])}${count}</a></li>`;
  });
  return [
    `<nav class="tabs" aria-label="${e(L.header.navigation)}">`,
    `<ul>${items.join("")}</ul>`,
    "</nav>",
  ].join("\n");
}

function pageSection(page: ReportPage): string {
  const titleId = `page-${page}-title`;
  return [
    `<section class="page" data-page-section="${page}" aria-labelledby="${titleId}" hidden>`,
    '<header class="page-head">',
    `<h2 id="${titleId}" tabindex="-1">${e(L.nav[page])}</h2>`,
    `<p class="page-lead">${e(L.pages[page])}</p>`,
    "</header>",
    '<div class="page-body"></div>',
    "</section>",
  ].join("\n");
}

function footer(): string {
  const helpItems = L.footer.helpItems.map((item) => `<li>${e(item)}</li>`).join("");
  return [
    '<footer class="footer">',
    `<p id="${IDS.generated}"></p>`,
    `<p>${e(L.footer.privacy)}</p>`,
    `<p id="${IDS.readNotes}" hidden></p>`,
    `<details class="help"><summary>${e(L.footer.help)}</summary><ul>${helpItems}</ul></details>`,
    "</footer>",
  ].join("\n");
}

function drawer(): string {
  return [
    `<dialog class="drawer" id="${IDS.drawer}" aria-labelledby="${IDS.drawerTitle}">`,
    '<div class="drawer-panel">',
    '<header class="drawer-head">',
    `<div class="drawer-heading"><p class="drawer-kicker" id="${IDS.drawerProvider}"></p>`,
    `<h2 id="${IDS.drawerTitle}"></h2></div>`,
    '<div class="drawer-actions">',
    `<button type="button" class="button" id="${IDS.drawerCopy}" hidden>`,
    `${e(L.drawer.copy)}</button>`,
    `<button type="button" class="icon-button" id="${IDS.drawerClose}"`,
    ` aria-label="${e(L.drawer.close)}"><span aria-hidden="true">×</span></button>`,
    "</div>",
    "</header>",
    `<div class="drawer-body" id="${IDS.drawerBody}"></div>`,
    "</div>",
    "</dialog>",
  ].join("\n");
}

/**
 * Failures are hatched and skips dotted wherever they are drawn, so the
 * stacked columns read without colour (red and green merge for many colour-
 * blind readers, and in grayscale print). Colours come from the stylesheet.
 */
const PATTERNS = [
  '<svg class="defs" aria-hidden="true" focusable="false" width="0" height="0"><defs>',
  '<pattern id="pattern-failed" width="6" height="6" patternUnits="userSpaceOnUse"',
  ' patternTransform="rotate(45)">',
  '<rect class="pattern-base-failed" width="6" height="6"></rect>',
  '<rect class="pattern-ink-failed" width="2" height="6"></rect>',
  "</pattern>",
  '<pattern id="pattern-skipped" width="5" height="5" patternUnits="userSpaceOnUse">',
  '<rect class="pattern-base-skipped" width="5" height="5"></rect>',
  '<circle class="pattern-ink-skipped" cx="2.5" cy="2.5" r="1.2"></circle>',
  "</pattern>",
  "</defs></svg>",
].join("");
