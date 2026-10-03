/**
 * Interactive behaviour, from the default locale: terminal tabs (click, arrow
 * keys, Home/End, replay), the copy button and its announcement, a FAQ
 * fragment opening its item, and the language menu (keyboard, dismissal,
 * fragment carried over to the other locale).
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

const menuState = (page) =>
  page.evaluate(() => ({
    isOpen: document.querySelector(".lang").open,
    hasSummaryFocus: document.activeElement?.classList.contains("lang-summary") === true,
  }));

/** Keyboard opening, the listed locales, Escape and outside-click dismissal. */
async function checkMenuBehaviour(report, page, pages) {
  await page.focus(".lang-summary");
  await page.keyboard.press("Enter");
  report.check("language menu: Enter opens it", (await menuState(page)).isOpen);
  const links = await page.$$eval(".lang-list a", (nodes) =>
    nodes.map((node) => ({ lang: node.lang, isCurrent: node.getAttribute("aria-current") })),
  );
  const current = links.filter((link) => link.isCurrent === "page");
  report.check(`language menu: lists the ${pages.length} locales`, links.length === pages.length);
  report.check("language menu: marks exactly the current one", current.length === 1);
  await page.keyboard.press("Escape");
  const afterEscape = await menuState(page);
  report.check(
    "language menu: Escape closes it and refocuses the summary",
    !afterEscape.isOpen && afterEscape.hasSummaryFocus,
  );
  await page.click(".lang-summary");
  await page.mouse.click(8, 600);
  report.check("language menu: an outside click closes it", !(await menuState(page)).isOpen);
}

/** @param {Context} ctx @param {readonly PageContext[]} pages */
async function checkLanguageMenu({ report, browser, origin }, pages) {
  const home = pages.find((page) => page.locale.isDefault);
  const { context, page } = await openPage(browser, `${origin}${localeHref(home.locale)}#faq`);
  await checkMenuBehaviour(report, page, pages);
  const destination = pages.at(-1);
  await page.click(".lang-summary");
  await page.click(`.lang-list a[hreflang="${destination.locale.hreflang}"]`);
  await page.waitForURL((url) => url.pathname === localeHref(destination.locale));
  report.check(
    `language menu: switching keeps the fragment (→ ${destination.locale.id})`,
    new URL(page.url()).hash === "#faq",
    page.url(),
  );
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
  await checkLanguageMenu(ctx, pages);
}
