/**
 * Injects the server-rendered markup into the built dist/index.html.
 *
 * Runs after both Vite passes:
 *   1. `vite build`                       → dist/ (client bundle + index.html)
 *   2. `vite build --ssr src/entry-server.jsx --outDir dist-ssr` → the renderer
 *
 * The SSR bundle is imported here, `render()` is called once, and the result
 * replaces the empty `<div id="root"></div>` in dist/index.html. The client
 * entry then hydrates it instead of mounting from scratch.
 *
 * This step is load-bearing for SEO, so it fails loudly: an empty #root would
 * ship a blank page to every crawler that does not execute JavaScript, and
 * that failure is invisible in a browser.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const htmlPath = resolve(root, "dist/index.html");
const ssrEntry = resolve(root, "dist-ssr/entry-server.js");
const ROOT_PLACEHOLDER = '<div id="root"></div>';

const { render } = await import(pathToFileURL(ssrEntry).href);
const markup = render();

if (!markup || markup.length < 2000) {
  throw new Error(
    `prerender: render() returned ${markup?.length ?? 0} chars — expected the ` +
      "whole page. Refusing to ship an empty #root.",
  );
}

const html = readFileSync(htmlPath, "utf8");
if (!html.includes(ROOT_PLACEHOLDER)) {
  throw new Error(
    `prerender: could not find ${ROOT_PLACEHOLDER} in dist/index.html. ` +
      "Keep the mount point on one line and empty in index.html.",
  );
}

writeFileSync(
  htmlPath,
  html.replace(ROOT_PLACEHOLDER, `<div id="root">${markup}</div>`),
  "utf8",
);

// The SSR bundle is a build artefact, never deployed.
rmSync(resolve(root, "dist-ssr"), { recursive: true, force: true });

process.stdout.write(`prerender: injected ${markup.length} chars into dist/index.html\n`);
