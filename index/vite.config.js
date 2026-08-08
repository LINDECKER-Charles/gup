import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages base path. Must stay aligned with package.json "homepage" at the
// repo root (https://lindecker-charles.github.io/gup/) and with every absolute
// URL hardcoded in index.html, sitemap.xml, llms.txt, and the JSON-LD blocks.
const BASE = "/gup/";

// `static/` is the publicDir. Its content is copied verbatim to the build root,
// preserving SEO-critical URLs already indexed by Google/Bing — notably the
// /gup/public/* asset paths referenced by sitemap.xml, OG tags, manifest icons
// and JSON-LD logo entries. Renaming this dir to anything other than "public"
// avoids colliding with Vite's default convention while keeping the subfolder
// structure (static/public/* → /gup/public/*).
export default defineConfig({
  base: BASE,
  publicDir: "static",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
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
