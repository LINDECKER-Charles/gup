/**
 * Post-build checks against the real deployed artefact, driven by Playwright.
 *
 * Serves dist/ under the /gup/ base path (so the rooted asset URLs and the
 * self-hosted font paths resolve exactly as they will on GitHub Pages) and
 * asserts the things that are easy to break silently in a redesign and
 * expensive to notice later:
 *
 *   - the prerendered HTML really carries the content (JS disabled)
 *   - exactly one H1, and no gap in the heading hierarchy
 *   - every in-page anchor, including the legacy aliases, resolves
 *   - the JSON-LD @graph parses and states the version the repo is on
 *   - no unresolved build placeholder anywhere in the output
 *   - title/description stay inside their SERP budgets
 *   - no console error, no failed request
 *   - the terminal tabs and the copy button work
 *   - nothing overflows horizontally at 1440 / 820 / 390 px
 *
 * RUN: `npm run verify` (needs Playwright — see scripts/og-image.mjs for the
 * install line). Screenshots land in .verify/ when `--shots` is passed.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import { facts } from "../src/data/facts.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");
const BASE = "/gup/";
const PORT = 4178;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const failures = [];
const check = (label, ok, detail = "") => {
  if (ok) return void process.stdout.write(`  ok   ${label}\n`);
  failures.push(detail ? `${label} — ${detail}` : label);
  process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ""}\n`);
};

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    let rel = url.pathname.slice(BASE.length) || "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    const file = join(dist, rel);
    if (!existsSync(file) || !statSync(file).isFile()) {
      // Same behaviour as GitHub Pages: unmatched paths get 404.html.
      const fallback = join(dist, "404.html");
      res.writeHead(404, { "content-type": MIME[".html"] });
      if (existsSync(fallback)) createReadStream(fallback).pipe(res);
      else res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

// ---------------------------------------------------------------- static HTML

function checkBuiltFiles() {
  process.stdout.write("\nbuilt output\n");
  const html = readFileSync(resolve(dist, "index.html"), "utf8");

  check(
    "prerendered #root is populated",
    /<div id="root"><[^>]/.test(html) && html.length > 40000,
    `${html.length} bytes`,
  );
  check("H1 present in static HTML", /<h1[\s>]/.test(html));
  check(
    "install command present in static HTML",
    html.includes(`npm install -g ${facts.packageName}`),
  );

  for (const file of ["llms.txt", "llms-full.txt", "sitemap.xml", "404.html", "public/site.webmanifest"]) {
    const text = readFileSync(resolve(dist, file), "utf8");
    const leftover = text.match(/@@[A-Z_]+@@/g);
    check(`${file}: no unresolved placeholder`, !leftover, leftover?.join(", "));
    check(`${file}: states ${facts.providerCount} providers or n/a`, !text.includes("~130"));
  }

  const sitemap = readFileSync(resolve(dist, "sitemap.xml"), "utf8");
  check("sitemap lastmod is a date", /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap));
  check("sitemap declares the social image", sitemap.includes("og-image.png"));
  check("og-image.png exists", existsSync(resolve(dist, "public/og-image.png")));

  const graph = JSON.parse(
    html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
  );
  const byType = Object.fromEntries(graph["@graph"].map((n) => [n["@type"], n]));
  check(
    "JSON-LD @graph has the expected node types",
    ["Person", "WebSite", "WebPage", "SoftwareApplication", "SoftwareSourceCode", "FAQPage"].every(
      (t) => byType[t],
    ),
    Object.keys(byType).join(", "),
  );
  check(
    `JSON-LD softwareVersion is ${facts.version}`,
    byType.SoftwareApplication?.softwareVersion === facts.version,
    byType.SoftwareApplication?.softwareVersion,
  );
  check(
    "JSON-LD nodes cross-reference the Person @id",
    byType.WebSite?.publisher?.["@id"]?.endsWith("#person"),
  );
  // Checked against the parsed graph, not the raw HTML: the comment above the
  // block names SearchAction to explain why it is gone.
  check(
    "no dead SearchAction in the graph",
    !JSON.stringify(graph).includes('"SearchAction"'),
  );

  const title = html.match(/<title>(.*?)<\/title>/)[1];
  check(`title ≤ 60 chars (${title.length})`, title.length <= 60, title);
  const description = html.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? "";
  check(`description ≤ 160 chars (${description.length})`, description.length <= 160);
  check("twitter card is summary_large_image", html.includes('content="summary_large_image"'));
  check("google-site-verification kept", html.includes("google-site-verification"));
}

// ------------------------------------------------------------------- in-browser

async function checkPage(browser, shots) {
  process.stdout.write("\nrendered page\n");
  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));

  await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: "networkidle" });

  check("no console error", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("no failed request", failed.length === 0, failed.slice(0, 3).join(" | "));

  const headings = await page.$$eval("h1, h2, h3, h4, h5, h6", (nodes) =>
    nodes.map((n) => ({ level: Number(n.tagName[1]), text: n.textContent.trim().slice(0, 40) })),
  );
  check(
    "exactly one H1",
    headings.filter((h) => h.level === 1).length === 1,
    `${headings.filter((h) => h.level === 1).length} found`,
  );
  const jumps = headings
    .slice(1)
    .map((h, i) => (h.level - headings[i].level > 1 ? `${headings[i].text} → ${h.text}` : null))
    .filter(Boolean);
  check("no heading-level jump", jumps.length === 0, jumps.join(" | "));
  check("no h5/h6", !headings.some((h) => h.level >= 5));

  const anchors = await page.$$eval('a[href^="#"]', (links) => links.map((l) => l.hash.slice(1)));
  const missing = [];
  for (const id of new Set(anchors.filter(Boolean))) {
    if (!(await page.$(`#${id}`))) missing.push(id);
  }
  check("every in-page link has a target", missing.length === 0, missing.join(", "));

  const legacy = ["problem", "modes", "lifecycle", "providers"];
  const legacyMissing = [];
  for (const id of legacy) if (!(await page.$(`#${id}`))) legacyMissing.push(id);
  check("legacy anchors still resolve", legacyMissing.length === 0, legacyMissing.join(", "));

  check(
    "images declare intrinsic size",
    (await page.$$eval("img", (imgs) => imgs.every((i) => i.width && i.height))) === true,
  );
  check("skip link present", (await page.$(".skip-link")) !== null);

  // Terminal tabs.
  const tabs = await page.$$('[role="tab"]');
  check("terminal exposes a tablist", tabs.length >= 3, `${tabs.length} tabs`);
  await tabs[1]?.click();
  check(
    "selecting a tab moves aria-selected",
    (await tabs[1]?.getAttribute("aria-selected")) === "true",
  );
  // The scene types itself out one line per 95ms, so wait for the content
  // rather than for a fixed delay.
  const swapped = await page
    .waitForFunction(
      () => document.querySelector("#term-panel")?.textContent.includes("providerId"),
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false);
  check("selecting a tab swaps the scene", swapped);

  // Copy button — clipboard needs a permission grant in Chromium.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click(".install-copy");
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("copy button copies the install command", clip.includes(facts.packageName), clip);

  await page.close();
  await context.close();
}

async function checkNoScript(browser) {
  process.stdout.write("\nJavaScript disabled\n");
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: "load" });

  check("H1 renders", (await page.textContent("h1")).includes("commande"));
  check(
    `provider count visible (${facts.providerCount})`,
    (await page.textContent("body")).includes(String(facts.providerCount)),
  );
  check("install section present", (await page.$("#install")) !== null);
  check("footer doc links present", (await page.$$('a[href*="docs/guide/cli-reference.md"]')).length > 0);
  check(
    "content is actually visible, not left hidden by the reveal layer",
    await page.locator("#pourquoi h2").isVisible(),
  );
  await context.close();
}

async function checkViewports(browser, shots) {
  process.stdout.write("\nresponsive\n");
  if (shots) mkdirSync(resolve(root, ".verify"), { recursive: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${vp.name} (${vp.width}px): no horizontal overflow`, overflow <= 1, `${overflow}px`);

    if (shots) {
      await page.screenshot({
        path: resolve(root, `.verify/${vp.name}-top.png`),
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(root, `.verify/${vp.name}-bottom.png`) });
    }
    await context.close();
  }
}

async function checkReducedMotion(browser) {
  process.stdout.write("\nprefers-reduced-motion\n");
  const context = await browser.newContext({
    viewport: VIEWPORTS[0],
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  check(
    "reveal layer stays disarmed",
    (await page.$$('[data-reveal-armed="1"]')).length === 0,
  );
  check(
    "architecture diagram is shown complete",
    (await page.$$('.pipeline-box[data-on="1"]')).length >= 3,
  );
  check(
    "terminal shows the full scene",
    (await page.$$(".term-line")).length > 10,
  );
  await context.close();
}

// ------------------------------------------------------------------------ main

const shots = process.argv.includes("--shots");
checkBuiltFiles();

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  throw new Error(
    "verify: Playwright is not installed. Run `npm i -D playwright && " +
      "npx playwright install chromium`, then `npm run verify`.",
  );
}

const server = await serve();
const browser = await chromium.launch();
try {
  await checkPage(browser, shots);
  await checkNoScript(browser);
  await checkReducedMotion(browser);
  await checkViewports(browser, shots);
} finally {
  await browser.close();
  server.close();
}

process.stdout.write(
  failures.length
    ? `\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}\n`
    : "\nall checks passed\n",
);
process.exitCode = failures.length ? 1 : 0;
