/**
 * Renders one 1200×630 social card per locale from the resolved catalogs:
 * the hero title, the install command and the trust line, in the page's own
 * language and direction.
 *
 *   default locale → static/public/og-image.png   (keeps the indexed URL)
 *   other locales  → static/public/og/<id>.png     (then set `ogImage` in src/i18n/locales.js)
 *
 * RUN: `npm run og`. The PNGs are committed, so neither the build nor the
 * deploy depends on this script. Needs Playwright's Chromium
 * (`npx playwright install chromium`). Latin text uses the self-hosted faces;
 * Han, Devanagari, Bengali and Arabic use the system fonts Chromium picks for
 * the card's `lang` — run it on Windows or macOS, or on Linux after
 * installing `fonts-noto-core fonts-noto-cjk`, otherwise those cards render
 * tofu.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "../build/html/escape.mjs";
import { pageContexts } from "../build/page-context.mjs";
import { facts, installCommand } from "../src/data/facts.js";
import { lastContentChange } from "./last-change.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = join(ROOT, "static");
const CARD = Object.freeze({ width: 1200, height: 630 });
const TRUST_ITEMS = 3;

const dataUri = (relative, mime) =>
  `data:${mime};base64,${readFileSync(join(STATIC, relative)).toString("base64")}`;

const ASSETS = Object.freeze({
  anton: dataUri("fonts/anton-latin-400-normal.woff2", "font/woff2"),
  mono: dataUri("fonts/geist-mono-latin-wght-normal.woff2", "font/woff2"),
  logo: dataUri("public/logo-64.png", "image/png"),
});

/** Latin titles use Anton in capitals; other scripts a heavy system face, no case. */
function titleStyle(locale) {
  return locale.script === "latin"
    ? `font-family: "Anton"; font-weight: 400; font-size: 86px; line-height: 1;
       text-transform: uppercase;`
    : `font-family: system-ui, sans-serif; font-weight: 800; font-size: 72px; line-height: 1.3;`;
}

const STYLE = `
  @font-face { font-family: "Anton"; src: url("${ASSETS.anton}") format("woff2"); }
  @font-face { font-family: "Geist Mono"; src: url("${ASSETS.mono}") format("woff2"); }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${CARD.width}px; height: ${CARD.height}px; display: flex; flex-direction: column;
    justify-content: space-between; padding: 58px 72px; overflow: hidden;
    color: oklch(0.97 0.004 265); font-family: "Geist Mono", monospace;
    background:
      radial-gradient(900px 620px at 82% -14%, oklch(0.68 0.2 275 / 0.42), transparent 62%),
      radial-gradient(760px 520px at -8% 104%, oklch(0.85 0.15 75 / 0.16), transparent 64%),
      oklch(0.13 0.008 265); }
  header { display: flex; align-items: center; gap: 18px; }
  header img { width: 42px; height: 42px; border-radius: 11px; }
  .word { font-family: "Anton"; font-size: 34px; letter-spacing: 0.05em; line-height: 1; }
  .badge { font-size: 16px; padding: 6px 12px; border-radius: 6px; color: oklch(0.8 0.15 275);
    border: 1px solid oklch(0.68 0.2 275 / 0.5); }
  .accent { --accent-angle: 100deg; background-image: linear-gradient(var(--accent-angle),
      oklch(0.75 0.19 275), oklch(0.97 0.004 265) 54%, oklch(0.85 0.15 75));
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  [dir="rtl"] .accent { --accent-angle: 260deg; }
  .cmd { display: inline-flex; gap: 14px; margin-block-start: 28px; padding: 16px 24px;
    border-radius: 12px; background: oklch(0.08 0.008 265);
    border: 1px solid oklch(0.3 0.02 275); font-size: 25px; direction: ltr; }
  .cmd span { color: oklch(0.8 0.17 150); }
  footer { display: flex; gap: 34px; font-size: 19px; color: oklch(0.7 0.01 265); }`;

function cardHtml(page) {
  const { locale } = page;
  const { title, trust } = page.messages.hero;
  const [before, accent, after] = [title.before, title.accent, title.after].map(escapeHtml);
  const footer = trust.slice(0, TRUST_ITEMS).map((item) => `<span>${escapeHtml(item)}</span>`);
  return `<!doctype html><html lang="${locale.htmlLang}" dir="${locale.dir}">
<meta charset="utf-8"><style>${STYLE} h1 { ${titleStyle(locale)} }</style>
<header dir="ltr"><img src="${ASSETS.logo}" alt=""><span class="word">GUP</span>
  <span class="badge">v${escapeHtml(facts.version)}</span></header>
<main><h1>${before}<br><span class="accent">${accent}</span><br>${after}</h1>
  <div class="cmd"><span>$</span>${escapeHtml(installCommand)}</div></main>
<footer>${footer.join("")}</footer>`;
}

const outputFor = (page) =>
  page.locale.isDefault
    ? join(STATIC, "public", "og-image.png")
    : join(STATIC, "public", "og", `${page.locale.id}.png`);

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (cause) {
    const hint = "run `npm ci` then `npx playwright install chromium`";
    throw new Error(`og-image: Playwright is missing — ${hint}.`, { cause });
  }
}

async function renderCard(browser, page) {
  const tab = await browser.newPage({ viewport: CARD, deviceScaleFactor: 1 });
  await tab.setContent(cardHtml(page), { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.screenshot({ type: "png" });
  await tab.close();
  const file = outputFor(page);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  process.stdout.write(`og-image: ${page.locale.id} → ${file} (${png.length} bytes)\n`);
}

const chromium = await loadChromium();
const browser = await chromium.launch();
try {
  for (const page of pageContexts({ modified: lastContentChange(ROOT) })) {
    await renderCard(browser, page);
  }
} finally {
  await browser.close();
}
