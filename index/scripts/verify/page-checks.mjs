/**
 * Browser checks run on every locale: a clean load (no console error, failed
 * request or CSP violation — hydration errors included), heading outline,
 * in-page links, image sizes, skip link; then the same page with JavaScript
 * off (prerendered content complete and visible) and under reduced motion
 * (nothing left hidden, terminal complete).
 *
 * @typedef {import("../../build/page-context.mjs").PageContext} PageContext
 * @typedef {{ report: ReturnType<import("./report.mjs").createReport>,
 *   browser: import("playwright").Browser, origin: string }} Context
 */
import { facts } from "../../src/data/facts.js";
import { JSON_SCENE } from "../../src/data/scenes/json-scene.js";
import { localeHref } from "../../src/i18n/locale-href.js";
import { openPage } from "./browser.mjs";

const MAX_HEADING_LEVEL = 4;
const squash = (text) => text.replace(/\s+/g, "");
const urlOf = (origin, target) => origin + localeHref(target.locale);

async function headingOutline(page) {
  const levels = await page.$$eval("h1, h2, h3, h4, h5, h6", (nodes) =>
    nodes.map((node) => Number(node.tagName[1])),
  );
  return {
    h1: levels.filter((level) => level === 1).length,
    jumps: levels.slice(1).filter((level, i) => level - levels[i] > 1).length,
    deepest: Math.max(...levels),
  };
}

function missingAnchors(page) {
  return page.$$eval('a[href^="#"]', (links) =>
    [...new Set(links.map((link) => link.hash.slice(1)))].filter(
      (id) => id && !document.getElementById(id),
    ),
  );
}

function unsizedImages(page) {
  return page.$$eval(
    "img",
    (images) => images.filter((img) => !img.getAttribute("width") || !img.getAttribute("height"))
      .length,
  );
}

async function skipLinkWorks(page) {
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.className);
  await page.keyboard.press("Enter");
  return focused === "skip-link" && (await page.evaluate(() => location.hash)) === "#top";
}

/** @param {Context} ctx @param {PageContext} target */
async function checkRendered({ report, browser, origin }, target) {
  const { id } = target.locale;
  const { context, page, errors } = await openPage(browser, urlOf(origin, target));
  const outline = await headingOutline(page);
  const missing = await missingAnchors(page);
  report.check(
    `${id}: no console error, failed request or CSP violation`,
    errors.length === 0,
    errors.slice(0, 3).join(" | "),
  );
  report.check(
    `${id}: one H1, no heading jump, nothing below h${MAX_HEADING_LEVEL}`,
    outline.h1 === 1 && outline.jumps === 0 && outline.deepest <= MAX_HEADING_LEVEL,
    JSON.stringify(outline),
  );
  report.check(`${id}: every in-page link has a target`, missing.length === 0, missing.join(", "));
  report.check(`${id}: images declare their size`, (await unsizedImages(page)) === 0);
  report.check(`${id}: skip link is the first stop and lands on #top`, await skipLinkWorks(page));
  await context.close();
}

/** @param {Context} ctx @param {PageContext} target */
async function checkNoScript({ report, browser, origin }, target) {
  const { id } = target.locale;
  const { title } = target.messages.hero;
  const options = { javaScriptEnabled: false };
  const { context, page } = await openPage(browser, urlOf(origin, target), options);
  const h1 = squash((await page.textContent("h1")) ?? "");
  const main = (await page.textContent("main")) ?? "";
  const expected = squash(title.before + title.accent + title.after);
  report.check(`${id} (no JS): H1 is the catalog title`, h1 === expected, h1);
  report.check(`${id} (no JS): provider count visible`, main.includes(String(facts.providerCount)));
  const lastVisible = await page.locator("#install h2").isVisible();
  report.check(`${id} (no JS): last section visible`, lastVisible);
  await context.close();
}

/** @param {Context} ctx @param {PageContext} target */
async function checkReducedMotion({ report, browser, origin }, target) {
  const { id } = target.locale;
  const options = { reducedMotion: "reduce" };
  const { context, page } = await openPage(browser, urlOf(origin, target), options);
  const armed = (await page.$$("[data-reveal-armed]")).length;
  await page.click("#term-tab-json");
  const lines = await page.$$eval("#term-panel .term-line", (nodes) => nodes.length);
  report.check(`${id} (reduced motion): nothing armed to hide`, armed === 0, `${armed} armed`);
  report.check(
    `${id} (reduced motion): terminal scene shown complete`,
    lines === JSON_SCENE.lines.length,
    `${lines} lines`,
  );
  await context.close();
}

/**
 * @param {Context} ctx
 * @param {readonly PageContext[]} pages
 */
export async function runPageChecks(ctx, pages) {
  ctx.report.section("rendered pages");
  for (const target of pages) {
    await checkRendered(ctx, target);
    await checkNoScript(ctx, target);
    await checkReducedMotion(ctx, target);
  }
}
