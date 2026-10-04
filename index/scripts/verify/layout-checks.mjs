/**
 * Geometry: no horizontal overflow at desktop, tablet and phone widths on
 * every locale, each install command box showing the whole command inside its
 * card, and every right-to-left locale mirrored where it should be:
 * header brand on the right, arrows pointing along the reading direction,
 * the terminal caption in the page's direction, the language menu's names
 * all starting on the right, while the terminal itself, commands and key caps
 * stay left-to-right. `--shots` saves top and bottom
 * screenshots per locale and viewport into .verify/.
 *
 * @typedef {import("../../build/page-context.mjs").PageContext} PageContext
 * @typedef {{ report: ReturnType<import("./report.mjs").createReport>,
 *   browser: import("playwright").Browser, origin: string, shotsDir?: string }} Context
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { installCommand } from "../../src/data/facts.js";
import { localeHref } from "../../src/i18n/locale-href.js";
import { openPage } from "./browser.mjs";

const VIEWPORTS = Object.freeze([
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
]);
const OVERFLOW_TOLERANCE_PX = 1;
/** Below this width the section links become a sideways-scrolling row (nav.css). */
const NARROW_HEADER_MAX_PX = 859;

const overflowOf = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Each install command box: its text, how much of it scrolls out of sight, its card's edges. */
const commandBoxesOf = (page) =>
  page.$$eval(".cmd-line", (lines) =>
    lines.map((line) => {
      const box = line.getBoundingClientRect();
      const card = (line.closest(".hero-copy, .install-panel") ?? line).getBoundingClientRect();
      return {
        text: line.querySelector("code")?.textContent ?? "",
        hidden: line.scrollWidth - line.clientWidth,
        outside: Math.max(card.left - box.left, box.right - card.right),
      };
    }),
  );

/** The hero's and the install section's: the full command, unscrolled, inside the card. */
async function checkInstallCommand(report, page, name) {
  const boxes = await commandBoxesOf(page);
  const defects = boxes.flatMap((box, index) => [
    ...(box.text === installCommand ? [] : [`#${index} shows "${box.text}"`]),
    ...(box.hidden <= OVERFLOW_TOLERANCE_PX ? [] : [`#${index} hides ${box.hidden}px`]),
    ...(box.outside <= OVERFLOW_TOLERANCE_PX ? [] : [`#${index} leaves its card`]),
  ]);
  report.check(
    `${name}: the install command shows whole, inside its card`,
    boxes.length > 0 && defects.length === 0,
    defects.join(", ") || `${boxes.length} boxes`,
  );
}

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
    const name = `${target.locale.id} @ ${viewport.width}px`;
    ctx.report.check(
      `${name}: no horizontal overflow`,
      overflow <= OVERFLOW_TOLERANCE_PX,
      `${overflow}px`,
    );
    await checkInstallCommand(ctx.report, page, name);
    if (ctx.shotsDir) await saveShots(page, ctx.shotsDir, `${target.locale.id}-${viewport.name}`);
    await context.close();
  }
}

function rtlGeometry(page) {
  return page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      dir: document.documentElement.dir,
      isBrandRight: box(".nav-brand").left > box(".nav-cta").left,
      ltrRuns: [".term", ".cmd-line code", "kbd"].map((selector) => style(selector).direction),
      isArrowMirrored: style(".icon--directional").transform.startsWith("matrix(-1,"),
      caption: style(".term-caption").direction,
      isLinkRowFaded: style(".nav-links").maskImage !== "none",
      menuStarts: (() => {
        document.querySelector(".lang").open = true;
        const names = [...document.querySelectorAll(".lang-list a span:last-child")];
        return new Set(names.map((name) => Math.round(name.getBoundingClientRect().right))).size;
      })(),
    };
  });
}

function reportRightToLeft(report, name, { geometry, overflow, isNarrow }) {
  report.check(`${name}: html dir is rtl`, geometry.dir === "rtl");
  report.check(`${name}: brand sits on the right of Install`, geometry.isBrandRight);
  report.check(
    `${name}: terminal, commands and key caps stay ltr`,
    geometry.ltrRuns.every((direction) => direction === "ltr"),
    geometry.ltrRuns.join(" "),
  );
  report.check(`${name}: arrows point along the reading direction`, geometry.isArrowMirrored);
  report.check(`${name}: the terminal caption reads right-to-left`, geometry.caption === "rtl");
  report.check(`${name}: language menu names all start on the right`, geometry.menuStarts === 1);
  report.check(`${name}: no overflow`, overflow <= OVERFLOW_TOLERANCE_PX, `${overflow}px`);
  report.check(
    `${name}: header links faded only where they scroll`,
    geometry.isLinkRowFaded === isNarrow,
  );
}

/** @param {Context} ctx @param {readonly PageContext[]} pages */
async function checkRightToLeft({ report, browser, origin }, pages) {
  for (const target of pages.filter((page) => page.locale.dir === "rtl")) {
    for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
      const options = { viewport, reducedMotion: "reduce" };
      const url = origin + localeHref(target.locale);
      const { context, page } = await openPage(browser, url, options);
      // Overflow first: measuring the geometry leaves the language menu open.
      const overflow = await overflowOf(page);
      const measured = { geometry: await rtlGeometry(page), overflow };
      const isNarrow = viewport.width <= NARROW_HEADER_MAX_PX;
      const name = `${target.locale.id} @ ${viewport.width}px`;
      reportRightToLeft(report, name, { ...measured, isNarrow });
      await context.close();
    }
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
