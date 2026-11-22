/**
 * The feedback form, as shipped. Without JavaScript, in every locale: a plain
 * post to the service, every control labelled, the honeypot out of reach and
 * the CSP naming the service. With JavaScript (default locale, the service
 * answered by a stub so nothing leaves the machine): the CLI's link prefills
 * the form and the outcome of a plain post is shown, a valid send posts JSON
 * without the honeypot and resets the form, an invalid one reports the
 * service's fields next to the field.
 *
 * @typedef {import("../../build/page-context.mjs").PageContext} PageContext
 * @typedef {{ report: ReturnType<import("./report.mjs").createReport>,
 *   browser: import("playwright").Browser, origin: string }} Context
 */
import { LINKS } from "../../src/data/links.js";
import { localeHref } from "../../src/i18n/locale-href.js";
import { FEEDBACK_ENDPOINT } from "../../src/feedback/submit-feedback.js";
import { openPage } from "./browser.mjs";

const INSTALL_ID = "123e4567-e89b-42d3-a456-426614174000";
const CLI_LINK = `?install=${INSTALL_ID}&version=0.6.0&platform=win32&feedback=limited#feedback`;
const CORS = Object.freeze({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST",
});

/** Facts about the prerendered form, read in the page. */
const readForm = (page) =>
  page.evaluate(() => {
    const form = document.querySelector("form.feedback-form");
    const controls = [...form.querySelectorAll("input:not([type=hidden]):not([name=website]), textarea")];
    const trap = form.querySelector('[name="website"]');
    return {
      method: form.method,
      action: form.action,
      unlabelled: controls.filter((control) => !control.labels?.length).map((c) => c.name),
      required: ["title", "message"].map((name) => form.elements[name].required),
      trap: { tabIndex: trap.tabIndex, hidden: !!trap.closest('[aria-hidden="true"]') },
      names: [...form.elements].map((element) => element.name).filter(Boolean),
    };
  });

/** @param {Context} ctx @param {PageContext} target */
async function checkWithoutJs({ report, browser, origin }, target) {
  const { id } = target.locale;
  const options = { javaScriptEnabled: false };
  const url = origin + localeHref(target.locale);
  const { context, page } = await openPage(browser, url, options);
  const form = await readForm(page);
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
  report.check(`${id} (no JS): the form posts to the service`, form.method === "post" && form.action === FEEDBACK_ENDPOINT);
  report.check(`${id} (no JS): every control has a label`, form.unlabelled.length === 0, form.unlabelled.join());
  report.check(`${id} (no JS): title and message are required`, form.required.every(Boolean));
  report.check(`${id} (no JS): the honeypot is hidden and out of the tab order`, form.trap.tabIndex === -1 && form.trap.hidden);
  report.check(`${id} (no JS): the plain post carries the page's locale and return URL`, ["locale", "returnTo"].every((name) => form.names.includes(name)));
    const allows = (directive) => csp.match(new RegExp(`${directive} [^;]*`))?.[0].includes(LINKS.feedbackApi);
  report.check(`${id}: the CSP allows the service`, allows("connect-src") && allows("form-action"));
  await context.close();
}

/** Answers the service from the stub: preflight, then the given response. */
async function stubService(page, respond, seen) {
  await page.route(`${LINKS.feedbackApi}/**`, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    seen.push(request.postDataJSON());
    const { status, body } = respond();
    return route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function fillAndSend(page, { title = "Crash on start", message = "It crashes right after the scan." } = {}) {
  await page.fill("#feedback-field-title", title);
  await page.fill("#feedback-field-message", message);
  await page.click('form.feedback-form button[type="submit"]');
}

/** @param {Context} ctx @param {PageContext} target */
async function checkArrival({ report, browser, origin }, target) {
  const { feedback } = target.messages;
  const { context, page } = await openPage(browser, origin + localeHref(target.locale) + CLI_LINK);
  const state = await page.evaluate(() => ({
    installId: document.querySelector("#feedback-field-installId").value,
    version: document.querySelector('[name="gupVersion"]').value,
    platform: document.querySelector('[name="platform"]').value,
    status: document.querySelector("#feedback-status").textContent,
    search: window.location.search,
    isStatusFocused: document.activeElement?.id === "feedback-status",
  }));
  report.check("feedback: the CLI link prefills install ID, version and platform", state.installId === INSTALL_ID && state.version === "0.6.0" && state.platform === "win32", JSON.stringify(state));
  report.check("feedback: ?feedback=limited shows its message, focused, and leaves the URL", state.status === feedback.status.limited && state.isStatusFocused && !state.search.includes("feedback="), JSON.stringify(state));
  await context.close();
}

/** @param {Context} ctx @param {PageContext} target */
async function checkSubmit({ report, browser, origin }, target) {
  const { feedback } = target.messages;
  const { context, page, errors } = await openPage(browser, origin + localeHref(target.locale));
  const seen = [];
  let reply = { status: 201, body: { id: 1 } };
  await stubService(page, () => reply, seen);
  await page.check('input[name="kind"][value="suggestion"]');
  await fillAndSend(page, { title: "ab" });
  const shortTitle = await page.$eval("#feedback-field-title", (input) => ({ invalid: input.getAttribute("aria-invalid"), described: document.getElementById(input.getAttribute("aria-describedby"))?.textContent }));
  report.check("feedback: a too-short title is reported before any request", shortTitle.invalid === "true" && shortTitle.described === feedback.errors.title && seen.length === 0, JSON.stringify(shortTitle));
  await page.fill("#feedback-field-email", "reporter@example.com");
  await fillAndSend(page);
  await page.waitForFunction((text) => document.querySelector("#feedback-status")?.textContent === text, feedback.status.sent);
  const after = await page.evaluate(() => ({ title: document.querySelector("#feedback-field-title").value, message: document.querySelector("#feedback-field-message").value, email: document.querySelector("#feedback-field-email").value, kind: document.querySelector('input[name="kind"]:checked').value }));
  report.check("feedback: a send posts JSON, clears the report and keeps kind and address", seen.length === 1 && seen[0].kind === "suggestion" && seen[0].locale === target.locale.id && typeof seen[0].startedAt === "number" && !("website" in seen[0]) && after.title === "" && after.message === "" && after.email === "reporter@example.com" && after.kind === "suggestion", JSON.stringify({ seen, after }));
  report.check("feedback: no console error or CSP violation while sending", errors.length === 0, errors.join(" | "));
  reply = { status: 400, body: { error: "invalid", fields: ["message"] } };
  await fillAndSend(page);
  await page.waitForSelector("#feedback-field-message[aria-invalid='true']");
  const status = await page.textContent("#feedback-status");
  report.check("feedback: the service's invalid fields are shown next to the field", status === feedback.status.invalid);
  reply = { status: 429, body: { error: "rate_limited" } };
  await fillAndSend(page);
  await page.waitForFunction((text) => document.querySelector("#feedback-status")?.textContent === text, feedback.status.limited);
  await context.close();
}

/**
 * @param {Context} ctx
 * @param {readonly PageContext[]} pages
 */
export async function runFeedbackChecks(ctx, pages) {
  ctx.report.section("feedback form");
  for (const page of pages) await checkWithoutJs(ctx, page);
  const home = pages.find((page) => page.locale.isDefault);
  await checkArrival(ctx, home);
  await checkSubmit(ctx, home);
}
