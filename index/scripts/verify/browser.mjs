/**
 * Opens a page in a fresh Playwright context and records everything that
 * would be a defect on a static site: console errors (React hydration
 * mismatches and CSP violations land there), uncaught exceptions and failed
 * requests.
 */
const DESKTOP = Object.freeze({ width: 1440, height: 900 });

/**
 * @param {import("playwright").Browser} browser
 * @param {string} url
 * @param {import("playwright").BrowserContextOptions} [options]
 */
export async function openPage(browser, url, options = {}) {
  const context = await browser.newContext({ viewport: DESKTOP, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("requestfailed", (request) => {
    errors.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  return { context, page, errors };
}
