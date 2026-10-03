/**
 * Post-build verification of dist/, as deployed: static checks on the files,
 * then Playwright (Chromium) against a local server that mimics GitHub Pages
 * under the base path. Exits non-zero on any failed check.
 *
 *   npm run verify               all checks
 *   npm run verify -- --shots    also write screenshots to .verify/
 *
 * Needs Chromium for Playwright: `npx playwright install chromium`.
 */
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { pageContexts } from "../../build/page-context.mjs";
import { lastContentChange } from "../last-change.mjs";
import { serveDist } from "../serve.mjs";
import { runInteractionChecks } from "./interaction-checks.mjs";
import { runLayoutChecks } from "./layout-checks.mjs";
import { runPageChecks } from "./page-checks.mjs";
import { createReport } from "./report.mjs";
import { runStaticChecks } from "./static-checks.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 4178;

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (cause) {
    const hint = "run `npm ci` then `npx playwright install chromium`";
    throw new Error(`verify: Playwright is missing — ${hint}.`, { cause });
  }
}

async function runBrowserChecks(report, pages) {
  const chromium = await loadChromium();
  const server = await serveDist({ port: PORT });
  const browser = await chromium.launch();
  const ctx = {
    report,
    browser,
    origin: new URL(server.url).origin,
    shotsDir: process.argv.includes("--shots") ? join(ROOT, ".verify") : undefined,
  };
  try {
    await runPageChecks(ctx, pages);
    await runInteractionChecks(ctx, pages);
    await runLayoutChecks(ctx, pages);
  } finally {
    await browser.close();
    await server.close();
  }
}

const report = createReport();
const pages = pageContexts({ modified: lastContentChange(ROOT) });
runStaticChecks({ report, dist: join(ROOT, "dist") }, pages);
await runBrowserChecks(report, pages);
report.finish();
