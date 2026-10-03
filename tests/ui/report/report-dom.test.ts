import { Window, type Element } from "happy-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryEvent } from "../../../src/core/history/types.js";
import type { ReportModel } from "../../../src/core/export/report-types.js";
import { renderReportHtml } from "../../../src/report/render-report.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";
import { REPORT_NOW, realisticHistory, reportModelOf } from "./report-fixtures.js";

/**
 * The report as a reader meets it: the generated file loaded in a browser
 * window (happy-dom), its own script run by the page, then read and clicked
 * through. Each test gets a fresh window, as a fresh tab would be.
 */

const DAY_MS = 86_400_000;
const at = (daysAgo: number) => new Date(REPORT_NOW.getTime() - daysAgo * DAY_MS).toISOString();
const dayOf = (daysAgo: number) => at(daysAgo).slice(0, 10);
const HOSTILE = "<img src=x onerror=alert(1)>";

const EVENTS: readonly HistoryEvent[] = [
  scanEvent({ ts: at(9), outdated: 12, trigger: "menu", runId: "run-1" }),
  updateEvent("winget", "Google.Chrome", { ts: at(8), from: "128.0", to: "129.0", runId: "run-1" }),
  updateEvent("npm-g", "typescript", { ts: at(8.9), durationMs: 18_400, runId: "run-1" }),
  updateEvent("choco", "nodejs", {
    ts: at(3),
    status: "failed",
    message: "exit code 1603\nsee C:\\ProgramData\\chocolatey\\logs",
    runId: "run-2",
    trigger: "cli",
  }),
  updateEvent("winget", "Spotify.Spotify", {
    ts: at(2.9),
    status: "skipped",
    message: "ignorée par l'utilisateur",
    runId: "run-2",
    trigger: "cli",
  }),
  scanEvent({ ts: at(0.5), outdated: 7, runId: "run-3", trigger: "schedule" }),
  updateEvent("winget", "Google.Chrome", { ts: at(0.4), from: "129.0", to: "130.0", runId: "run-3" }),
];

interface Page {
  readonly window: Window;
  readonly $: (selector: string) => Element | null;
  readonly $$: (selector: string) => Element[];
  readonly text: (selector: string) => string;
  readonly settle: () => Promise<void>;
}

const windows: Window[] = [];

afterEach(async () => {
  for (const window of windows.splice(0)) {
    expect(window.happyDOM.virtualConsolePrinter.readAsString(), "the page logged an error").toBe("");
    await window.happyDOM.close();
  }
});

async function openReport(model: ReportModel = reportModelOf(EVENTS), hash = "#/overview"): Promise<Page> {
  const window = new Window({
    url: `file:///C:/Users/me/AppData/Local/gup/reports/gup-report.html${hash}`,
    width: 1280,
    height: 900,
    // The page's own script is the code under test: trusted, and needed.
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  windows.push(window);
  window.document.write(renderReportHtml(model));
  await window.happyDOM.waitUntilComplete();
  const { document } = window;
  const page: Page = {
    window,
    $: (selector) => document.querySelector(selector),
    $$: (selector) => [...document.querySelectorAll(selector)],
    text: (selector) => (document.querySelector(selector)?.textContent ?? "").replace(/\s+/g, " ").trim(),
    settle: () => window.happyDOM.waitUntilComplete(),
  };
  return page;
}

async function go(page: Page, hash: string): Promise<void> {
  page.window.location.hash = hash;
  await page.settle();
}

function click(page: Page, selector: string): void {
  const element = page.$(selector);
  if (element === null) throw new Error(`nothing matches ${selector}`);
  (element as unknown as { click(): void }).click();
}

function press(element: Element | null, key: string): void {
  if (element === null) throw new Error("no element to press a key on");
  const { KeyboardEvent } = element.ownerDocument.defaultView as unknown as Window;
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

async function search(page: Page, query: string): Promise<void> {
  const input = page.$("#search") as unknown as { value: string; dispatchEvent(event: unknown): boolean };
  input.value = query;
  input.dispatchEvent(new page.window.Event("input", { bubbles: true }));
  await page.settle();
}

const isOpen = (page: Page) => (page.$("#drawer") as unknown as { open: boolean }).open;

describe("report page: overview", () => {
  it("leads with the period in a sentence and the key numbers", async () => {
    const page = await openReport();

    expect(page.text(".hero-number")).toBe("3");
    expect(page.text(".hero-sentence")).toBe(
      "Sur les 12 derniers mois, gup a mis à jour 2 paquets avec 75 % de réussite.",
    );
    expect(page.$$(".kpi .kpi-value").map((value) => value.textContent?.replace(/\s+/g, " "))).toEqual([
      "75 %",
      "2",
      "1",
      "1",
      "2",
      "7",
    ]);
    expect(page.$(".kpi-failed")).not.toBeNull();
    expect(page.$$("[data-nav] .nav-count").map((count) => count.textContent)).toEqual(["4", "1", "3"]);
  });

  it("charts the weeks with a table of the same numbers behind a toggle", async () => {
    const page = await openReport();
    const toggle = page.$$(".chart-actions .link-button")[0];

    expect(page.$$("svg.chart-svg[role='img']")).toHaveLength(2);
    expect(page.$("svg.chart-svg")?.getAttribute("aria-label")).toContain("5 tentatives");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    (toggle as unknown as { click(): void }).click();

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    const rows = page.$$(".chart .data-table tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.textContent)).toContainEqual(expect.stringContaining("Semaine du"));
  });

  it("shows the empty period plainly, everywhere", async () => {
    const page = await openReport(reportModelOf([]));

    expect(page.text(".hero-sentence")).toBe(
      "Sur les 12 derniers mois, gup n'a rien enregistré. Élargissez la période pour voir plus d'activité.",
    );
    await go(page, "#/packages");
    expect(page.text("[data-page-section='packages'] .empty-title")).toBe(
      "Aucun paquet mis à jour sur cette période.",
    );
    await go(page, "#/failures");
    expect(page.text("[data-page-section='failures'] .empty-title")).toBe("Aucun échec sur cette période.");
  });

  it("warns when the attempts were capped", async () => {
    const page = await openReport({ ...reportModelOf(EVENTS), truncated: 12 });

    expect(page.$("#banner")?.hasAttribute("hidden")).toBe(false);
    expect(page.text("#banner")).toContain("seules les 5 tentatives les plus récentes sont détaillées");
  });
});

describe("report page: calendar", () => {
  it("draws every day of the period, Monday first, one grid per year", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/calendar");

    const grids = page.$$("[role='grid']");
    expect(grids.map((grid) => grid.getAttribute("aria-label"))).toEqual(["Activité de 2026", "Activité de 2025"]);
    for (const grid of grids) expect(grid.querySelectorAll("[role='row']")).toHaveLength(7);
    expect(page.$$("[role='gridcell']")).toHaveLength(366);
    expect(page.$$("[role='gridcell'][tabindex='0']")).toHaveLength(1);
  });

  it("describes a day in words and moves by day and week with the arrows", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/calendar");
    const active = page.$("[role='gridcell'][tabindex='0']");

    expect(active?.getAttribute("aria-label")).toBe(`${longDay(dayOf(0.4))} : 1 réussie, 1 scan`);
    press(active, "ArrowLeft");
    const weekBefore = page.$("[role='gridcell'][tabindex='0']");
    expect(weekBefore?.getAttribute("aria-label")).toContain(longDay(dayOf(7.4)));
    expect(page.window.document.activeElement).toBe(weekBefore);
    press(weekBefore, "ArrowDown");
    expect(page.$("[role='gridcell'][tabindex='0']")?.getAttribute("aria-label")).toContain(longDay(dayOf(6.4)));
  });

  it("opens the sessions of a day with Entrée", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/calendar");
    const day = page.$(`[data-day][aria-label^="${longDay(dayOf(3))}"]`);

    press(day, "Enter");
    await page.settle();

    expect(page.window.location.hash).toBe(`#/sessions?day=${dayOf(3)}`);
    expect(page.$$(".session")).toHaveLength(1);
    expect(page.text(".day-filter")).toContain(longDay(dayOf(3)));
  });

  it("grades the days by the distinct counts, as the terminal heatmap does", async () => {
    const counts = [1, 1, 2, 3, 4, 8];
    const events = counts.flatMap((count, index) =>
      Array.from({ length: count }, (_unused, n) =>
        updateEvent("pip", `pkg-${n}`, { ts: at(20 - index * 2) }),
      ),
    );
    const page = await openReport(reportModelOf(events), "#/calendar");

    const levels = counts.map((_count, index) =>
      page.$(`[role='gridcell'][aria-label^="${longDay(dayOf(20 - index * 2))}"]`)?.getAttribute("data-level"),
    );
    expect(levels).toEqual(["1", "1", "1", "2", "3", "4"]);
  });
});

describe("report page: packages", () => {
  it("narrows the table as the search is typed, and says how many match", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/packages");

    expect(page.$$("#packages-body tr")).toHaveLength(4);
    await search(page, "chrome");

    expect(page.$$("#packages-body tr").map((row) => row.querySelector(".package-link")?.textContent)).toEqual([
      "Google.Chrome",
    ]);
    expect(page.text("#packages-count")).toBe("1 paquet sur 4");
    expect(page.text("#live")).toBe("1 paquet sur 4");
  });

  it("finds a package by the message of its failures", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/packages");

    await search(page, "1603");

    expect(page.text("#packages-body tr .package-link")).toBe("nodejs");
  });

  it("sends a search typed on another page to the packages", async () => {
    const page = await openReport();

    await search(page, "spotify");

    expect(page.window.location.hash).toBe("#/packages");
    expect(page.text("#packages-body .package-link")).toBe("Spotify.Spotify");
  });

  it("sorts by a column, saying so to assistive technologies", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/packages");

    click(page, "th[data-column='failures'] .sort");

    expect(page.$("th[data-column='failures']")?.getAttribute("aria-sort")).toBe("descending");
    expect(page.$("th[data-column='successes']")?.hasAttribute("aria-sort")).toBe(false);
    expect(page.text("#packages-body tr .package-link")).toBe("nodejs");
    click(page, "th[data-column='failures'] .sort");
    expect(page.$("th[data-column='failures']")?.getAttribute("aria-sort")).toBe("ascending");
  });

  it("opens a package's drawer with its versions and attempts, and closes back to the row", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/packages");
    const button = page.$$("#packages-body .package-link").find((link) => link.textContent === "Google.Chrome");
    (button as unknown as { focus(): void; click(): void }).focus();
    (button as unknown as { click(): void }).click();
    await page.settle();

    expect(isOpen(page)).toBe(true);
    expect(page.window.location.hash).toMatch(/^#\/packages\?pkg=\d+$/);
    expect(page.text("#drawer-title")).toBe("Google.Chrome");
    expect(page.text("#drawer-provider")).toBe("Windows Package Manager");
    expect(page.$$(".timeline li").map((item) => item.textContent?.replace(/\s+/g, " "))).toEqual([
      expect.stringContaining("129.0 → 130.0"),
      expect.stringContaining("128.0 → 129.0"),
    ]);
    expect(page.$$("#drawer-body .attempt")).toHaveLength(2);

    click(page, "#drawer-close");
    await page.settle();

    expect(isOpen(page)).toBe(false);
    expect(page.window.location.hash).toBe("#/packages");
    const focused = page.window.document.activeElement;
    expect(focused?.className).toBe("package-link");
    expect(focused?.textContent).toBe("Google.Chrome");
  });

  it("opens the drawer from its address, and Back closes it", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/failures?pkg=1");

    expect(isOpen(page)).toBe(true);
    expect(page.$("[data-page-section='failures']")?.hasAttribute("hidden")).toBe(false);
    await go(page, "#/failures");
    expect(isOpen(page)).toBe(false);
  });
});

describe("report page: failures and sessions", () => {
  it("groups failures by package and message, with a way to the package", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/failures");

    expect(page.text(".page-intro")).toBe("1 échec sur 1 paquet, du plus fréquent au plus rare.");
    expect(page.text(".failure-card .failure-times")).toBe("1 fois");
    expect(page.text(".failure-card h3")).toBe("nodejs");
    expect(page.text(".failure-card .message")).toBe("exit code 1603");
    click(page, ".failure-card .failure-open");
    await page.settle();
    expect(page.text("#drawer-title")).toBe("nodejs");
    expect(page.text("#drawer-body .message")).toContain("see C:\\ProgramData\\chocolatey\\logs");
  });

  it("lists every session by day, its attempts built when opened, filtered by outcome", async () => {
    const page = await openReport(reportModelOf(EVENTS), "#/sessions");

    expect(page.$$(".session-day")).toHaveLength(3);
    expect(page.text(".session summary .badge")).toBe("Planifiée");
    const first = page.$(".session") as unknown as { open: boolean; dispatchEvent(event: unknown): boolean };
    expect(page.$$(".session .attempt")).toHaveLength(0);
    first.open = true;
    first.dispatchEvent(new page.window.Event("toggle"));
    expect(page.$$(".session .attempt")).toHaveLength(1);

    const chips = page.$$(".chip");
    (chips[0] as unknown as { click(): void }).click();
    (chips[2] as unknown as { click(): void }).click();

    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(page.text("#sessions-count")).toBe("1 session");
    expect(page.text(".session summary")).toContain("Ligne de commande");
  });
});

describe("report page: safety and comfort", () => {
  it("shows hostile history text as text, never as markup", async () => {
    const events = [
      updateEvent("pip", HOSTILE, { ts: at(1), status: "failed", message: `</script><script>alert(2)</script>` }),
    ];
    const page = await openReport(reportModelOf(events), "#/packages");

    expect(page.text("#packages-body .package-link")).toBe(HOSTILE);
    await go(page, "#/packages?pkg=0");
    expect(page.text("#drawer-title")).toBe(HOSTILE);
    expect(page.text("#drawer-body .message")).toBe("</script><script>alert(2)</script>");
    expect(page.$$("img")).toHaveLength(0);
    expect(page.$$("script")).toHaveLength(3);
  });

  it("switches the theme, says which one is on, and remembers it", async () => {
    const page = await openReport();
    const root = page.window.document.documentElement;

    click(page, "[data-theme-choice='dark']");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(page.$("[data-theme-choice='dark']")?.getAttribute("aria-pressed")).toBe("true");
    expect(page.$("[data-theme-choice='auto']")?.getAttribute("aria-pressed")).toBe("false");
    expect(page.window.localStorage.getItem("gup-report-theme")).toBe("dark");

    click(page, "[data-theme-choice='auto']");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("focuses the search with / and clears it with Échap", async () => {
    const page = await openReport();
    const input = page.$("#search");

    press(page.$("main"), "/");
    expect(page.window.document.activeElement).toBe(input);
    await search(page, "chrome");
    press(input, "Escape");
    await page.settle();

    expect((input as unknown as { value: string }).value).toBe("");
    expect(page.$$("#packages-body tr")).toHaveLength(4);
  });

  it("renders every page before printing", async () => {
    const page = await openReport(reportModelOf(realisticHistory()));

    page.window.dispatchEvent(new page.window.Event("beforeprint"));
    await page.settle();

    for (const name of ["overview", "calendar", "packages", "failures", "sessions"]) {
      expect(page.$(`[data-page-section='${name}'] .page-body`)?.childElementCount).toBeGreaterThan(0);
    }
    expect(page.$$("#packages-body tr")).toHaveLength(reportModelOf(realisticHistory()).packages.length);
  });
});

/** "vendredi 2 octobre 2026", as the page words a day (TZ=UTC in tests). */
function longDay(day: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}
