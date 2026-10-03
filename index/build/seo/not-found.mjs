/**
 * dist/404.html — what GitHub Pages serves for any unmatched path under the
 * site, whatever the locale prefix (/gup/fr/oops included).
 *
 * One English page by design: GitHub Pages has a single 404 per site, so the
 * copy lives here rather than in the catalogs (seven translations of it would
 * never be served). Every locale's home is linked by its endonym instead.
 * `noindex, follow`, canonical to the default home, inline CSS, no script —
 * hence a CSP that allows nothing but that inline style.
 *
 * @typedef {import("../page-context.mjs").PageContext} PageContext
 */
import { facts, installCommand } from "../../src/data/facts.js";
import { LINKS } from "../../src/data/links.js";
import { escapeHtml } from "../html/escape.mjs";

const POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const COPY = Object.freeze({
  title: "Page not found",
  text:
    "This page does not exist. gup is a CLI that scans and updates " +
    `${facts.providerCount} installation sources in one command.`,
  home: "Back to the home page",
  languages: "Languages",
});

const STYLE = `
    :root { color-scheme: dark }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px;
      background: #06070a; color: #f4f5f8; font: 16px/1.6 ui-sans-serif, system-ui, sans-serif;
      text-align: center }
    main { max-inline-size: 46ch }
    .status { margin: 0; font-size: clamp(48px, 12vw, 96px); font-weight: 700; line-height: 1.1 }
    h1 { margin: 0 0 8px; font-size: 24px }
    p { margin: 0 0 24px; color: #b4b6c2 }
    code { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 14px; color: #c3c8ff; direction: ltr; unicode-bidi: isolate }
    ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 8px 14px; flex-wrap: wrap;
      justify-content: center }
    a { display: inline-block; padding: 8px 4px; color: #c3c8ff; text-underline-offset: 3px }
    a.home { padding: 11px 18px; margin-block-end: 28px; border-radius: 9px; background: #8b97ff;
      color: #0b0b12; font-weight: 600; text-decoration: none }
    a:focus-visible { outline: 2px solid #c3c8ff; outline-offset: 2px }`;

const languageItem = (page) =>
  `<li><a href="${escapeHtml(page.url)}" hreflang="${escapeHtml(page.locale.hreflang)}" ` +
  `lang="${escapeHtml(page.locale.htmlLang)}" dir="${page.locale.dir}">` +
  `${escapeHtml(page.locale.endonym)}</a></li>`;

function body(pages, home) {
  return `<main>
    <p class="status" aria-hidden="true">404</p>
    <h1>${COPY.title}</h1>
    <p>${escapeHtml(COPY.text)} <code>${escapeHtml(installCommand)}</code></p>
    <a class="home" href="${escapeHtml(home.url)}">${COPY.home}</a>
    <nav aria-label="${COPY.languages}">
      <ul>
        ${pages.map(languageItem).join("\n        ")}
      </ul>
    </nav>
  </main>`;
}

/**
 * @param {readonly PageContext[]} pages
 * @returns {string}
 */
export function buildNotFound(pages) {
  const home = pages.find((page) => page.locale.isDefault);
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${POLICY}">
  <title>${COPY.title} — gup</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${escapeHtml(home.url)}">
  <meta name="theme-color" content="#06070a">
  <meta name="color-scheme" content="dark">
  <link rel="icon" type="image/svg+xml" href="${LINKS.basePath}public/favicon.svg">
  <link rel="icon" type="image/x-icon" href="${LINKS.basePath}public/favicon.ico">
  <style>${STYLE}
  </style>
</head>
<body>
  ${body(pages, home)}
</body>
</html>
`;
}
