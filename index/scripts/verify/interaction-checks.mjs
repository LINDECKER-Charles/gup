/**
 * Interactive behaviour, on the default locale: terminal tabs (click, arrow
 * keys, Home/End, replay), the copy button and its announcement, and a FAQ
 * fragment opening its item.
 *
 * @typedef {import("../../build/page-context.mjs").PageContext} PageContext
 * @typedef {{ report: ReturnType<import("./report.mjs").createReport>,
 *   browser: import("playwright").Browser, origin: string }} Context
 */
import { installCommand } from "../../src/data/facts.js";
import { localeHref } from "../../src/i18n/locale-href.js";
import { openPage } from "./browser.mjs";

const REPLAY_TIMEOUT_MS = 5000;
const ANNOUNCE_TIMEOUT_MS = 2000;

const selectedTab = (page) =>
  page.$eval('[role="tab"][aria-selected="true"]', (tab) => tab.id.replace("term-tab-", ""));
const focusedTab = (page) =>
  page.evaluate(() => document.activeElement?.id.replace("term-tab-", ""));

/** @param {Context} ctx @param {PageContext} target */
async function checkTabs({ report, browser, origin }, target) {
  const { context, page } = await openPage(browser, origin + localeHref(target.locale));
  await page.click("#term-tab-update");
  report.check("tabs: click selects", (await selectedTab(page)) === "update");
  await page.keyboard.press("ArrowRight");
  const afterArrow = [await selectedTab(page), await focusedTab(page)];
  report.check("tabs: → selects and focuses the next tab", afterArrow.join() === "json,json");
  await page.keyboard.press("Home");
  report.check("tabs: Home goes to the first tab", (await selectedTab(page)) === "app");
  await page.keyboard.press("End");
  report.check("tabs: End goes to the last tab", (await selectedTab(page)) === "json");
  const replayed = await page
    .waitForFunction(
      () => document.querySelector("#term-panel")?.textContent.includes("exit 0"),
      null,
      { timeout: REPLAY_TIMEOUT_MS },
    )
    .then(() => true, () => false);
  report.check("tabs: the JSON scene plays through to its last line", replayed);
  await context.close();
}

/** @param {Context} ctx @param {PageContext} target */
async function checkCopy({ report, browser, origin }, target) {
  const { context, page } = await openPage(browser, origin + localeHref(target.locale));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click(".cmd-copy");
  const announced = await page
    .waitForFunction(
      (text) =>
        [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === text),
      target.messages.common.copyStatus,
      { timeout: ANNOUNCE_TIMEOUT_MS },
    )
    .then(() => true, () => false);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  report.check("copy: the install command reaches the clipboard", clipboard === installCommand);
  report.check("copy: the success is announced in a status region", announced);
  await context.close();
}

/** @param {Context} ctx @param {PageContext} target */
async function checkFaqFragment({ report, browser, origin }, target) {
  const url = `${origin}${localeHref(target.locale)}#faq-ci`;
  const { context, page } = await openPage(browser, url);
  const isOpen = await page.$eval("#faq-ci", (details) => details.open);
  report.check("faq: #faq-<id> opens that question", isOpen);
  await context.close();
}

/**
 * @param {Context} ctx
 * @param {readonly PageContext[]} pages
 */
export async function runInteractionChecks(ctx, pages) {
  ctx.report.section("interactions");
  const home = pages.find((page) => page.locale.isDefault);
  await checkTabs(ctx, home);
  await checkCopy(ctx, home);
  await checkFaqFragment(ctx, home);
}
