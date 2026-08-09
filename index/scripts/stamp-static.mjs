/**
 * Applies the build-time facts to the text assets copied verbatim out of
 * static/ — llms.txt, llms-full.txt, sitemap.xml, robots.txt, 404.html and
 * site.webmanifest.
 *
 * Runs against dist/, never the source, so the committed files keep their
 * placeholders and diffs stay deterministic. Every listed file is required: a
 * missing one means the publicDir wiring broke, which would silently 404 an
 * SEO-critical URL that is already indexed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { lastContentChange } from "./last-change.mjs";
import { applyTokens, buildTokens } from "./tokens.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");

const TARGETS = [
  "llms.txt",
  "llms-full.txt",
  "sitemap.xml",
  "robots.txt",
  "404.html",
  "public/site.webmanifest",
];

const tokens = buildTokens(lastContentChange(root));

for (const relative of TARGETS) {
  const path = resolve(dist, relative);
  if (!existsSync(path)) {
    throw new Error(
      `stamp-static: dist/${relative} is missing. It should have been copied ` +
        "from static/ by Vite's publicDir — check vite.config.js publicDir " +
        "and that the file exists under static/.",
    );
  }
  writeFileSync(path, applyTokens(readFileSync(path, "utf8"), tokens, relative), "utf8");
}

process.stdout.write(
  `stamp-static: ${TARGETS.length} assets stamped · v${tokens["@@VERSION@@"]} · ` +
    `${tokens["@@PROVIDERS@@"]} providers · lastmod ${tokens["@@LASTMOD@@"]}\n`,
);
