import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lastContentChange } from "./scripts/last-change.mjs";
import { applyTokens, buildTokens } from "./scripts/tokens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// GitHub Pages base path. Must stay aligned with package.json "homepage" at the
// repo root (https://lindecker-charles.github.io/gup/) and with every absolute
// URL hardcoded in index.html, sitemap.xml, llms.txt, and the JSON-LD @graph.
const BASE = "/gup/";

// `static/` is the publicDir. Its content is copied verbatim to the build root,
// preserving SEO-critical URLs already indexed by Google/Bing — notably the
// /gup/public/* asset paths referenced by sitemap.xml, OG tags, manifest icons
// and JSON-LD image entries, plus /gup/robots.txt, /gup/sitemap.xml and
// /gup/llms.txt. Renaming this dir to anything other than "public" avoids
// colliding with Vite's default convention while keeping the subfolder
// structure (static/public/* → /gup/public/*).
const PUBLIC_DIR = "static";

/**
 * Substitutes the double-at placeholders in index.html from the generated facts
 * module, in dev and in build alike. Static text assets under `static/` get the
 * same treatment after the build — see scripts/stamp-static.mjs.
 */
function htmlFacts() {
  return {
    name: "gup-html-facts",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return applyTokens(html, buildTokens(lastContentChange(HERE)), "index.html");
      },
    },
  };
}

export default defineConfig({
  base: BASE,
  publicDir: PUBLIC_DIR,
  plugins: [react(), htmlFacts()],
  build: {
    outDir: "dist",
    sourcemap: false,
    // Oxc, not esbuild. Vite 8 dropped esbuild from its dependency tree: asking
    // for `minify: "esbuild"` re-enables the `vite:esbuild-transpile` plugin,
    // whose `transformWithEsbuild` now requires esbuild to be installed
    // separately — which fails the build outright on a clean `npm ci`. `target`
    // is unaffected: Rolldown lowers to it natively through `transform.target`.
    minify: "oxc",
    target: "es2020",
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Vite 8 swapped Rollup for Rolldown, which only accepts the function
        // form of `manualChunks` — the object map that worked under Rollup
        // now aborts the build with "manualChunks is not a function". The
        // function form is understood by both bundlers, so this stays portable
        // if the bundler changes again.
        //
        // `scheduler` rides along deliberately: it is react-dom's own runtime
        // dependency, and leaving it out strands it in the entry chunk, which
        // defeats the point of splitting React off in the first place.
        manualChunks(id) {
          return /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
            ? "react"
            : undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    open: BASE,
  },
});
