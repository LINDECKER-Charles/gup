/**
 * Turns the Vite-built index.html template into one locale's page.
 *
 * Slots (each must appear exactly once in the template):
 *   - the exact `<html lang="en" dir="ltr">` tag → the locale's lang and dir;
 *   - `<!--gup:head-->`     → the localized head (optionally preceded by the CSP);
 *   - `<!--gup:app-->`      → the prerendered React markup ("" in dev);
 *   - `<!--gup:body-end-->` → the bootstrap JSON the client hydrates from, and
 *     the localized <noscript> note.
 *
 * The bootstrap carries the resolved messages minus `meta` (head-only), so the
 * client renders exactly the strings the server rendered.
 *
 * @typedef {import("../page-context.mjs").PageContext} PageContext
 * @typedef {object} RenderInput
 * @property {string} template
 * @property {PageContext} page
 * @property {string} appHtml
 * @property {string} [policy]  Content-Security-Policy; omitted in dev, where
 *   Vite's HMR client needs inline scripts and a websocket.
 */
import { BOOTSTRAP } from "../../src/i18n/bootstrap.js";
import { buildHead } from "../seo/head.mjs";
import { escapeHtml } from "./escape.mjs";
import { inlineJson } from "./inline-json.mjs";
import { fillTemplate } from "./template.mjs";

const SLOTS = Object.freeze({
  html: '<html lang="en" dir="ltr">',
  head: "<!--gup:head-->",
  app: "<!--gup:app-->",
  bodyEnd: "<!--gup:body-end-->",
});

function bootstrapOf(page) {
  const messages = Object.fromEntries(
    Object.entries(page.messages).filter(([namespace]) => namespace !== "meta"),
  );
  return { v: BOOTSTRAP.version, locale: page.locale.id, messages };
}

function bodyEnd(page) {
  const boot = inlineJson(bootstrapOf(page));
  const note = escapeHtml(page.messages.common.noscript);
  return [
    `<script id="${BOOTSTRAP.elementId}" type="application/json">${boot}</script>`,
    `<noscript><p class="noscript">${note}</p></noscript>`,
  ].join("\n    ");
}

function securityMeta(policy) {
  if (!policy) return "";
  return `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">\n    `;
}

/**
 * @param {RenderInput} input
 * @returns {string}
 */
export function renderPage({ template, page, appHtml, policy }) {
  return fillTemplate(template, {
    [SLOTS.html]: `<html lang="${escapeHtml(page.locale.htmlLang)}" dir="${page.locale.dir}">`,
    [SLOTS.head]: securityMeta(policy) + buildHead(page),
    [SLOTS.app]: appHtml,
    [SLOTS.bodyEnd]: bodyEnd(page),
  });
}
