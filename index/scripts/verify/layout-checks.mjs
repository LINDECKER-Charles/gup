/**
 * Geometry: no horizontal overflow at desktop, tablet and phone widths on
 * every locale, and the right-to-left layout mirrored where it should be
 * (header brand on the right, terminal kept left-to-right). The RTL check
 * runs on the first registered right-to-left locale, or — until one exists —
 * on the default page with `dir="rtl"` forced, so the logical-property layout
 * is exercised either way. `--shots` saves top and bottom screenshots per
 * locale and viewport into .verify/.
 *
 * @typedef {import("../../build/page-context.mjs").PageContext} PageContext
 * @typedef {{ report: ReturnType<import("./report.mjs").createReport>,
 *   browser: import("playwright").Browser, origin: string, shotsDir?: string }} Context
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { localeHref } from "../../src/i18n/locale-href.js";
import { openPage } from "./browser.mjs";

const VIEWPORTS = Object.freeze([
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
]);
const OVERFLOW_TOLERANCE_PX = 1;

const overflowOf = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function saveShots(page, shotsDir, name) {
  await page.screenshot({ path: join(shotsDir, `${name}-top.png`) });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: join(shotsDir, `${name}-bottom.png`) });
}

/** @param {Context} ctx @param {PageContext} target */
async function checkViewports(ctx, target) {
  for (const viewport of VIEWPORTS) {
    const url = ctx.origin + localeHref(target.locale);
    const options = { viewport, reducedMotion: "reduce" };
    const { context, page } = await openPage(ctx.browser, url, options);
    const overflow = await overflowOf(page);
    ctx.report.check(
      `${target.locale.id} @ ${viewport.width}px: no horizontal overflow`,
      overflow <= OVERFLOW_TOLERANCE_PX,
      `${overflow}px`,
    );
    if (ctx.shotsDir) await saveShots(page, ctx.shotsDir, `${target.locale.id}-${viewport.name}`);
    await context.close();
  }
}

function rtlGeometry(page) {
  return page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    return {
      dir: document.documentElement.dir,
      brandIsRight: box(".nav-brand").left > box(".nav-cta").left,
      terminal: getComputedStyle(document.querySelector(".term")).direction,
      code: getComputedStyle(document.querySelector(".cmd-line code")).direction,
    };
  });
}

/** @param {Context} ctx @param {readonly PageContext[]} pages */
async function checkRightToLeft({ report, browser, origin }, pages) {
  const native = pages.find((page) => page.locale.dir === "rtl");
  const target = native ?? pages.find((page) => page.locale.isDefault);
  const label = native ? target.locale.id : `${target.locale.id} forced rtl`;
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    const options = { viewport, reducedMotion: "reduce" };
    const { context, page } = await openPage(browser, origin + localeHref(target.locale), options);
    if (!native) await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
    const geometry = await rtlGeometry(page);
    const overflow = await overflowOf(page);
    const name = `${label} @ ${viewport.width}px`;
    report.check(`${name}: html dir is rtl`, geometry.dir === "rtl");
    report.check(`${name}: brand sits on the right of Install`, geometry.brandIsRight);
    report.check(
      `${name}: terminal and commands stay ltr`,
      geometry.terminal === "ltr" && geometry.code === "ltr",
    );
    report.check(`${name}: no overflow`, overflow <= OVERFLOW_TOLERANCE_PX, `${overflow}px`);
    await context.close();
  }
}

/**
 * @param {Context} ctx
 * @param {readonly PageContext[]} pages
 */
export async function runLayoutChecks(ctx, pages) {
  ctx.report.section("layout");
  if (ctx.shotsDir) mkdirSync(ctx.shotsDir, { recursive: true });
  for (const target of pages) await checkViewports(ctx, target);
  await checkRightToLeft(ctx, pages);
}
