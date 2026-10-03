/**
 * Writes the deployable pages into dist/: one prerendered HTML file per
 * locale (dist/index.html for the default locale, dist/<path>/index.html for
 * the others), the sitemap and the 404.
 *
 * Runs after both Vite passes:
 *   1. `vite build`                                          → client bundle + the template
 *   2. `vite build --ssr src/entry-server.jsx --outDir dist-ssr` → the renderer
 *
 * Load-bearing for SEO, so it fails loudly: a page whose markup is missing
 * would ship a blank page to every crawler that does not run JavaScript, and
 * that failure is invisible in a browser.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderPage } from "../build/html/render-page.mjs";
import { pageContexts } from "../build/page-context.mjs";
import { buildNotFound } from "../build/seo/not-found.mjs";
import { buildSitemap } from "../build/seo/sitemap.mjs";
import { lastContentChange } from "./last-change.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const SSR_DIR = join(ROOT, "dist-ssr");
const MIN_MARKUP_CHARS = 2000;

/**
 * Production Content-Security-Policy, as a <meta> (GitHub Pages cannot set
 * headers). Everything is same-origin; the JSON data blocks are not executed
 * and need no allowance. `style-src 'unsafe-inline'` covers the few React
 * `style` attributes (CSS custom properties). Never applied in dev, where
 * Vite's HMR client needs inline scripts and a websocket.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

function writeLocalePage(page, template, render) {
  const appHtml = render(page);
  if (appHtml.length < MIN_MARKUP_CHARS) {
    throw new Error(
      `prerender: ${page.locale.id} rendered ${appHtml.length} chars — expected the whole ` +
        "page. Refusing to ship an empty #root.",
    );
  }
  const dir = join(DIST, page.locale.path);
  mkdirSync(dir, { recursive: true });
  const html = renderPage({ template, page, appHtml, policy: CONTENT_SECURITY_POLICY });
  writeFileSync(join(dir, "index.html"), html, "utf8");
}

const template = readFileSync(join(DIST, "index.html"), "utf8");
const { render } = await import(pathToFileURL(join(SSR_DIR, "entry-server.js")).href);
const pages = pageContexts({ modified: lastContentChange(ROOT) });

for (const page of pages) writeLocalePage(page, template, render);
writeFileSync(join(DIST, "sitemap.xml"), buildSitemap(pages), "utf8");
writeFileSync(join(DIST, "404.html"), buildNotFound(pages), "utf8");

// The SSR bundle is a build artefact, never deployed.
rmSync(SSR_DIR, { recursive: true, force: true });

process.stdout.write(
  `prerender: ${pages.map((page) => page.locale.id).join(", ")} · sitemap.xml · 404.html\n`,
);
