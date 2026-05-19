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
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: BASE,
  },
});
