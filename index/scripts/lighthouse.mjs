/**
 * Lighthouse audit of the built site (`npm run lhci`): mobile emulation with
 * simulated throttling, one URL per script family, three runs each, every
 * category ≥ 0.95. Performance takes the best run (CI runners are noisy);
 * the other categories take the median. HTML reports land in .lighthouse/
 * (kept as a workflow artifact, never uploaded to public storage).
 *
 * Lighthouse is driven programmatically against Playwright's Chromium instead
 * of through @lhci/cli, whose dependency tree carries known high-severity
 * advisories; the assertions are the ones the website spec gives to LHCI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import { localeHref } from "../src/i18n/locale-href.js";
import { LOCALES } from "../src/i18n/locales.js";
import { serveDist } from "./serve.mjs";
import { createReport } from "./verify/report.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, ".lighthouse");
const SERVER_PORT = 4179;
const DEBUG_PORT = 9333;
const RUNS = 3;
const MIN_SCORE = 0.95;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
/** One page per script family: Latin, Arabic (RTL), Han, Indic. */
const AUDITED_LOCALES = ["en", "ar", "zh", "hi"];

const FLAGS = Object.freeze({
  port: DEBUG_PORT,
  output: "html",
  logLevel: "error",
  onlyCategories: CATEGORIES,
});

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Best run for performance, median run for the deterministic categories. */
function aggregate(results) {
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const scores = results.map((result) => result.lhr.categories[category].score ?? 0);
      return [category, category === "performance" ? Math.max(...scores) : median(scores)];
    }),
  );
}

async function auditUrl(url) {
  const results = [];
  for (let run = 0; run < RUNS; run += 1) {
    const result = await lighthouse(url, { ...FLAGS });
    if (!result) throw new Error(`lighthouse: no result for ${url}`);
    results.push(result);
  }
  return results;
}

async function auditLocale(report, origin, locale) {
  const results = await auditUrl(origin + localeHref(locale));
  writeFileSync(join(OUT, `${locale.id}.html`), results.at(-1).report, "utf8");
  for (const [category, score] of Object.entries(aggregate(results))) {
    report.check(`${locale.id}: ${category} ≥ ${MIN_SCORE}`, score >= MIN_SCORE, `${score}`);
  }
}

async function launchChromium() {
  const { chromium } = await import("playwright");
  return chromium.launch({ channel: "chromium", args: [`--remote-debugging-port=${DEBUG_PORT}`] });
}

const report = createReport();
const locales = LOCALES.filter((locale) => AUDITED_LOCALES.includes(locale.id));
mkdirSync(OUT, { recursive: true });
const server = await serveDist({ port: SERVER_PORT });
const browser = await launchChromium();
try {
  report.section(`lighthouse (mobile, ${RUNS} runs per page)`);
  for (const locale of locales) await auditLocale(report, new URL(server.url).origin, locale);
} finally {
  await browser.close();
  await server.close();
}
report.finish();
