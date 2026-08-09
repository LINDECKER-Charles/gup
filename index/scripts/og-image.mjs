/**
 * Renders static/public/og-image.png — the 1200x630 social card.
 *
 * WHY: the page shipped a 512x512 logo as its og:image and a `summary` Twitter
 * card, because no social image existed. A dev CLI's first traffic comes from X,
 * Discord, Slack, HN and Reddit unfurls, where a square logo card measurably
 * underperforms a wide one that shows the actual product. The output is
 * committed, so neither the build nor the deploy depends on this script.
 *
 * RUN: `npm run og`. Needs Playwright's Chromium; if it is not installed:
 *   npm i -D playwright && npx playwright install chromium
 * The card is drawn from the same tokens and the same typefaces as the page, so
 * regenerate it whenever the brand, the headline or the provider count changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { facts, installCommand } from "../src/data/facts.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const WIDTH = 1200;
const HEIGHT = 630;

/** Fonts and the logo are inlined as data URIs so the card renders with no
 *  network and no local web server. */
const dataUri = (relative, mime) =>
  `data:${mime};base64,${readFileSync(resolve(root, relative)).toString("base64")}`;

const anton = dataUri("static/fonts/anton-latin-400-normal.woff2", "font/woff2");
const mono = dataUri("static/fonts/geist-mono-latin-wght-normal.woff2", "font/woff2");
const logo = dataUri("static/public/logo-64.png", "image/png");

const card = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: "Anton"; src: url("${anton}") format("woff2"); }
  @font-face { font-family: "Geist Mono"; src: url("${mono}") format("woff2"); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 58px 72px;
    background:
      radial-gradient(900px 620px at 82% -14%, oklch(0.68 0.20 275 / 0.42), transparent 62%),
      radial-gradient(760px 520px at -8% 104%, oklch(0.85 0.15 75 / 0.16), transparent 64%),
      oklch(0.13 0.008 265);
    color: oklch(0.97 0.004 265);
    font-family: "Geist Mono", monospace;
    position: relative;
    overflow: hidden;
  }
  .grid {
    position: absolute; inset: -10%;
    background-image:
      linear-gradient(oklch(0.32 0.02 275 / 0.13) 1px, transparent 1px),
      linear-gradient(90deg, oklch(0.32 0.02 275 / 0.13) 1px, transparent 1px);
    background-size: 72px 72px;
    mask-image: radial-gradient(120% 100% at 50% 0%, black 10%, transparent 78%);
  }
  header, main, footer { position: relative; }
  header { display: flex; align-items: center; gap: 18px; }
  header img { width: 42px; height: 42px; border-radius: 11px; box-shadow: 0 0 0 1px oklch(0.30 0.02 275); }
  .word { font-family: "Anton"; font-size: 34px; letter-spacing: 0.05em; line-height: 1; }
  .badge {
    font-size: 16px; letter-spacing: 0.10em; padding: 6px 12px; border-radius: 6px;
    color: oklch(0.80 0.17 275); border: 1px solid oklch(0.68 0.20 275 / 0.5);
  }
  .kicker {
    margin-left: auto; font-size: 16px; letter-spacing: 0.20em;
    text-transform: uppercase; color: oklch(0.55 0.010 265);
  }
  h1 {
    font-family: "Anton"; font-weight: 400; font-size: 86px; line-height: 0.99;
    text-transform: uppercase; letter-spacing: -0.004em;
  }
  h1 .accent {
    background: linear-gradient(100deg, oklch(0.70 0.20 275), oklch(0.99 0.004 265) 54%, oklch(0.85 0.15 75));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .cmd {
    display: inline-flex; align-items: center; gap: 14px; margin-top: 30px;
    padding: 16px 24px; border-radius: 12px;
    background: oklch(0.08 0.008 265); border: 1px solid oklch(0.30 0.02 275);
    font-size: 25px;
  }
  .cmd .prompt { color: oklch(0.80 0.17 150); }
  footer { display: flex; gap: 34px; font-size: 19px; letter-spacing: 0.06em; color: oklch(0.58 0.010 265); }
  footer span:not(:last-child)::after { content: ""; }
</style>
<div class="grid"></div>
<header>
  <img src="${logo}" alt="">
  <span class="word">GUP</span>
  <span class="badge">v${facts.version}</span>
  <span class="kicker">Global Updater</span>
</header>
<main>
  <h1>Une commande.<br><span class="accent">${facts.providerCount} sources</span><br>à jour.</h1>
  <div class="cmd"><span class="prompt">$</span>${installCommand}</div>
</main>
<footer>
  <span>Windows · macOS · Linux · WSL</span>
  <span>Node ≥ ${facts.nodeMajor}</span>
  <span>MIT · open source</span>
</footer>`;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  throw new Error(
    "og-image: Playwright is not installed. Run `npm i -D playwright && " +
      "npx playwright install chromium`, then `npm run og`. The committed " +
      "og-image.png means the normal build never needs this.",
  );
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(card, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  const out = resolve(root, "static/public/og-image.png");
  writeFileSync(out, png);
  process.stdout.write(`og-image: wrote ${out} (${png.length} bytes)\n`);
} finally {
  await browser.close();
}
