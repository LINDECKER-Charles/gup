import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FIXTURE_CLOCK } from "./fixtures/clock.js";
import { writeHistoryFixture } from "./fixtures/journal/history.js";
import { REPORT_IMAGE } from "./output/report-image.js";

/**
 * `npm run screenshots:report`: the HTML report's picture for the docs
 * (`docs/assets/screens/html-report.png`). The fixture machine's year of
 * history is written in a throw-away directory, the built CLI writes its
 * report there (`gup report --no-open`: nothing opens), and a headless
 * Chromium — with a throw-away profile, never the user's browser — takes the
 * picture. Everything it wrote is deleted afterwards.
 *
 * Not part of `npm run screenshots`: a browser's rendering varies from one
 * machine to the next, so the picture cannot be checked byte for byte.
 * `CHROME_PATH` names the browser; otherwise the usual Chrome, Edge or
 * Chromium install is looked for.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI = join(ROOT, "dist", "cli.js");
const OUTPUT = join(ROOT, "docs", "assets", "screens", REPORT_IMAGE);
/** The fixture year, whole, up to the day the screenshots are taken. */
const PERIOD = { since: "2025-09-16", until: "2026-09-15" } as const;
const WINDOW = { width: 1280, height: 1100 } as const;
/** Time the page's script gets to draw the overview before the picture. */
const SCRIPT_BUDGET_MS = 5_000;
const GUP_VARIABLE = /^GUP_/i;

/** Chrome may still be closing its profile when it exits: give the removal a moment. */
const REMOVAL_RETRIES = { maxRetries: 10, retryDelay: 200 } as const;
const PROGRAM_FILES = process.env["ProgramFiles"] ?? "C:\\Program Files";
const PROGRAM_FILES_X86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

/** Chromium-based browsers where they install by default, by platform. */
const BROWSERS: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
  win32: [
    join(PROGRAM_FILES, "Google", "Chrome", "Application", "chrome.exe"),
    join(PROGRAM_FILES_X86, "Microsoft", "Edge", "Application", "msedge.exe"),
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"],
};

/**
 * The CLI's environment: none of the developer's `GUP_*` settings, every
 * gup directory in the sandbox, no settings file, no debug log, English
 * (the docs' language) and the fixture's time zone (the report counts days
 * in it).
 */
function sandboxEnv(sandbox: string): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(([name]) => !GUP_VARIABLE.test(name));
  return {
    ...Object.fromEntries(kept),
    GUP_HISTORY_DIR: join(sandbox, "history"),
    GUP_REPORT_DIR: join(sandbox, "reports"),
    GUP_LOG_DIR: join(sandbox, "logs"),
    GUP_SCHEDULER_DIR: join(sandbox, "scheduler"),
    GUP_CONFIG: "0",
    GUP_LOG_LEVEL: "off",
    GUP_LANG: "en",
    TZ: FIXTURE_CLOCK.timeZone,
  };
}

function browser(): string {
  const chosen = process.env["CHROME_PATH"];
  if (chosen) return chosen;
  const found = (BROWSERS[process.platform] ?? []).find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error("no Chromium-based browser found: set CHROME_PATH (Chrome, Edge, Chromium)");
}

/** `gup report --format html` over the fixture history, into `html`, never opened. */
function writeReport(html: string, env: NodeJS.ProcessEnv): void {
  const range = ["--since", PERIOD.since, "--until", PERIOD.until];
  const args = [CLI, "report", "--format", "html", ...range, "--out", html, "--no-open"];
  execFileSync(process.execPath, args, { env, stdio: "inherit" });
}

/** A headless picture of `html`, in a profile of its own that `sandbox` holds. */
function photograph(html: string, sandbox: string): void {
  execFileSync(
    browser(),
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--force-device-scale-factor=1",
      `--user-data-dir=${join(sandbox, "browser-profile")}`,
      `--window-size=${WINDOW.width},${WINDOW.height}`,
      `--virtual-time-budget=${SCRIPT_BUDGET_MS}`,
      `--screenshot=${OUTPUT}`,
      pathToFileURL(html).href,
    ],
    { stdio: "inherit" },
  );
}

function main(): void {
  const sandbox = mkdtempSync(join(tmpdir(), "gup-report-sample-"));
  try {
    const env = sandboxEnv(sandbox);
    // The fixture is written where the CLI will read it, in the fixture's time zone.
    process.env["TZ"] = FIXTURE_CLOCK.timeZone;
    process.env["GUP_HISTORY_DIR"] = env["GUP_HISTORY_DIR"];
    writeHistoryFixture(FIXTURE_CLOCK.now);
    const html = join(sandbox, "report.html");
    writeReport(html, env);
    photograph(html, sandbox);
  } finally {
    rmSync(sandbox, { recursive: true, force: true, ...REMOVAL_RETRIES });
  }
}

main();
