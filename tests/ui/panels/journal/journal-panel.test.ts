import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildInsights } from "../../../../src/core/insights/build-insights.js";
import { parsePeriod, type PeriodPreset } from "../../../../src/core/time/period.js";
import type { GlyphMode } from "../../../../src/ui/theme/glyphs.js";
import {
  exportNotice,
  JournalPanel,
  type JournalPanelDeps,
} from "../../../../src/ui/panels/journal/journal-panel.js";
import type { JournalData, JournalSource } from "../../../../src/ui/panels/journal/journal-source.js";
import type { Viewport } from "../../../../src/ui/panels/panel.js";
import { ACTIVITY_LABELS } from "../../../../src/ui/text/journal/activity-labels.js";
import { EXPORT_LABELS, JOURNAL_LABELS } from "../../../../src/ui/text/journal/journal-labels.js";
import type { KeyPress } from "../../../../src/ui/tui/screen-host.js";
import { lineWidth, type Line } from "../../../../src/ui/tui/styled-lines.js";
import { updateEvent } from "../../../support/history-fixtures.js";
import { useLocale } from "../../../support/locale.js";
import { JOURNAL_NOW, journalData, scriptedSource } from "./journal-data.js";

const WIDE: Viewport = { width: 90, height: 26 };
const NARROW: Viewport = { width: 50, height: 19 };

const key = (name: string): KeyPress => ({ name, ctrl: false, sequence: name.length === 1 ? name : "" });
const text = (lines: readonly Line[]) => lines.map((line) => line.map((segment) => segment.text).join(""));

function panel(source: JournalSource = scriptedSource(), over: Partial<JournalPanelDeps> = {}) {
  const redraw = vi.fn();
  const journal = new JournalPanel({
    source,
    redraw,
    choose: vi.fn(async () => undefined),
    glyphMode: () => "unicode" as GlyphMode,
    now: () => JOURNAL_NOW,
    ...over,
  });
  return { journal, redraw };
}

/** Let pending loads and exports settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function shown(source?: JournalSource, over?: Partial<JournalPanelDeps>) {
  const view = panel(source, over);
  view.journal.onShow();
  await settle();
  return view;
}

describe("JournalPanel", () => {
  it("loads the period when shown, saying so until the data arrives", async () => {
    const source = scriptedSource();
    const { journal } = panel(source);

    expect(text(journal.render(WIDE))).toContain(`  ${JOURNAL_LABELS.loading}`);
    journal.onShow();
    expect(journal.title).toBe("Journal · 12 derniers mois …");
    await settle();

    expect(source.load).toHaveBeenCalledWith(expect.objectContaining({ key: "12m" }));
    expect(journal.title).toBe("Journal · 12 derniers mois");
    expect(text(journal.render(WIDE)).join("\n")).toContain("3 mises à jour · 75 % réussies");
  });

  it("switches tabs with 1-4 and with [ ]", async () => {
    const { journal } = await shown();
    const tabBar = () => text(journal.render(WIDE))[0];

    expect(tabBar()).toBe("▌1 Activité  2 Récurrence  3 Événements  4 Debug");
    journal.press(key("3"));
    expect(tabBar()).toBe("1 Activité  2 Récurrence  ▌3 Événements  4 Debug");
    journal.press(key("]"));
    journal.press(key("]"));
    expect(tabBar()).toContain("▌1 Activité");
    journal.press(key("["));
    expect(tabBar()).toContain("▌4 Debug");
  });

  it("steps the period with p and reloads, keeping the previous data on screen meanwhile", async () => {
    const source = scriptedSource();
    const { journal } = await shown(source);

    journal.press(key("p"));

    expect(source.load).toHaveBeenLastCalledWith(expect.objectContaining({ key: "all" }));
    expect(journal.title).toBe("Journal · tout l'historique …");
    expect(text(journal.render(WIDE)).join("\n")).toContain("3 mises à jour");
  });

  it("shows the period the settings name, and follows them until p picks one", async () => {
    const source = scriptedSource();
    let setting: PeriodPreset = "30d";
    const { journal } = await shown(source, { defaultPeriod: () => setting });
    expect(journal.title).toBe("Journal · 30 derniers jours");

    setting = "90d";
    journal.onShow();
    expect(source.load).toHaveBeenLastCalledWith(expect.objectContaining({ key: "90d" }));

    journal.press(key("p"));
    setting = "all";
    journal.onShow();
    expect(source.load).toHaveBeenLastCalledWith(expect.objectContaining({ key: "12m" }));
  });

  it("names the schedule an update ran for in its detail, and keeps the id of one it cannot name", async () => {
    const events = [
      updateEvent("winget", "Git.Git", { ts: "2026-10-02T09:00:00.000Z", scheduleId: "a1b2c3d4" }),
      updateEvent("pip", "rich", { ts: "2026-10-01T09:00:00.000Z", scheduleId: "0badc0de" }),
    ];
    const scheduleName = (id: string) => (id === "a1b2c3d4" ? "Outils dev" : undefined);
    const { journal } = await shown(scriptedSource(journalData(events)), { scheduleName });

    for (const name of ["3", "return"]) journal.press(key(name));
    expect(text(journal.render(WIDE)).join("\n")).toMatch(/Planification +Outils dev/);
    for (const name of ["escape", "down", "return"]) journal.press(key(name));
    expect(text(journal.render(WIDE)).join("\n")).toMatch(/Planification +0badc0de/);
  });

  it("leaves Ctrl combinations to the tab", async () => {
    const source = scriptedSource();
    const { journal } = await shown(source);

    journal.press({ name: "p", ctrl: true, sequence: "\u0010" });

    expect(source.load).toHaveBeenCalledTimes(1);
    expect(journal.title).toBe("Journal · 12 derniers mois");
  });

  it("drops a load overtaken by a newer one", async () => {
    let resolveFirst: (data: JournalData) => void = () => {};
    const first = new Promise<JournalData>((resolve) => (resolveFirst = resolve));
    const fresh = journalData([]);
    const source: JournalSource = {
      load: vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(fresh),
      export: vi.fn(),
    };
    const { journal } = panel(source);

    journal.onShow();
    journal.press(key("r"));
    await settle();
    resolveFirst(journalData());
    await settle();

    expect(text(journal.render(WIDE)).join("\n")).toContain(ACTIVITY_LABELS.empty);
  });

  it("exports the chosen format for the period and tells where the file is", async () => {
    const source = scriptedSource();
    const choose = vi.fn(async () => "csv");
    const { journal } = await shown(source, { choose: choose as JournalPanelDeps["choose"] });

    journal.press(key("e"));
    await settle();

    expect(choose).toHaveBeenCalledWith(
      expect.objectContaining({
        title: EXPORT_LABELS.title,
        text: [EXPORT_LABELS.period("12 derniers mois"), "", EXPORT_LABELS.footer],
        choices: [
          { label: EXPORT_LABELS.html, value: "html" },
          { label: EXPORT_LABELS.json, value: "json" },
          { label: EXPORT_LABELS.csv, value: "csv" },
          { label: EXPORT_LABELS.diagnostic, value: "diagnostic" },
        ],
      }),
    );
    expect(source.export).toHaveBeenCalledWith("csv", expect.objectContaining({ key: "12m" }));
    expect(text(journal.render(WIDE)).at(-1)).toBe(EXPORT_LABELS.written("C:\\reports\\gup-history.json"));
    journal.press(key("down"));
    expect(text(journal.render(WIDE)).at(-1)).not.toContain("Export");
  });

  it("says why an export failed, and does nothing when the dialog is dismissed", async () => {
    const source = scriptedSource(journalData(), { ok: false, error: "EACCES" });
    const choose = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce("json");
    const { journal } = await shown(source, { choose });

    journal.press(key("e"));
    await settle();
    expect(source.export).not.toHaveBeenCalled();
    journal.press(key("e"));
    await settle();

    expect(text(journal.render(WIDE)).at(-1)).toBe(EXPORT_LABELS.failed("EACCES"));
  });

  it.each(["1", "2", "3", "4"])("opens the HTML report of the period with o on tab %s", async (tab) => {
    const path = "C:\\reports\\gup-report.html";
    const source = scriptedSource(journalData(), { ok: true, path, opened: true });
    const { journal } = await shown(source);

    journal.press(key(tab));
    journal.press(key("o"));
    await settle();

    expect(source.export).toHaveBeenCalledWith("html", expect.objectContaining({ key: "12m" }));
    expect(text(journal.render(WIDE)).at(-1)).toBe(EXPORT_LABELS.opened(path));
  });

  it.each([
    ["an 80-column terminal", 52],
    ["a 120-column terminal", 92],
  ])("keeps the opened report's path readable on %s", async (_terminal, width) => {
    const file = "gup-rapport-2026-10-04-1430.html";
    const path = join(homedir(), "AppData", "Local", "gup", "reports", file);
    const { journal } = await shown(scriptedSource(journalData(), { ok: true, path, opened: true }));

    journal.press(key("o"));
    await settle();

    const lines = text(journal.render({ width, height: 24 }));
    const status = lines.slice(lines.findIndex((line) => line.includes("Rapport ouvert")));
    expect(status).toHaveLength(2);
    expect(status.every((line) => line.length <= width)).toBe(true);
    expect(status[0]).toBe(EXPORT_LABELS.opened("").trimEnd());
    expect(status[1]?.startsWith("~")).toBe(true);
    expect(status[1]?.endsWith(file)).toBe(true);
  });

  it("gives the report's path when the browser could not be opened", async () => {
    const path = "C:\\reports\\gup-report.html";
    const { journal } = await shown(scriptedSource(journalData(), { ok: true, path, opened: false }));

    journal.press(key("o"));
    await settle();

    const status = journal.render(WIDE).at(-1);
    expect(text([status ?? []])[0]).toBe(EXPORT_LABELS.notOpened(path));
    expect(status?.[0]?.tone).toBe("warning");
  });

  it("words the run results' report from ~, the path whole when no width bounds it", () => {
    const folder = join("AppData", "Local", "gup", "reports");
    const file = "gup-rapport-2026-10-04-1430.html";

    const notice = exportNotice({ ok: true, path: join(homedir(), folder, file), opened: true });

    expect(notice.text).toBe(EXPORT_LABELS.opened(join("~", folder, file)));
    expect(notice.tone).toBe("success");
  });

  it("writes the diagnostic archive from the Debug tab with x", async () => {
    const source = scriptedSource();
    const { journal } = await shown(source);

    journal.press(key("4"));
    journal.press(key("x"));
    await settle();

    expect(source.export).toHaveBeenCalledWith("diagnostic", expect.anything());
  });

  it.each([
    ["an unreadable history", { error: "EACCES: permission denied" }, JOURNAL_LABELS.unreadable("EACCES: permission denied")],
    ["an empty period", {}, JOURNAL_LABELS.widenHint],
    ["recording turned off", { isRecordingOff: true }, JOURNAL_LABELS.recordingOff],
  ])("tells about %s on the history tabs", async (_case, history, expected) => {
    const { journal } = await shown(scriptedSource(journalData([], { history })));

    for (const tab of ["1", "2", "3"]) {
      journal.press(key(tab));
      expect(text(journal.render(WIDE)).join("\n")).toContain(expected);
    }
  });

  it("does not offer to widen a period that already covers the whole history", async () => {
    const insights = buildInsights([], { period: parsePeriod("all", JOURNAL_NOW)! });
    const { journal } = await shown(scriptedSource(journalData([], { history: { insights } })));

    const screen = text(journal.render(WIDE)).join("\n");
    expect(screen).toContain(ACTIVITY_LABELS.empty);
    expect(screen).not.toContain(JOURNAL_LABELS.widenHint);
  });

  it.each([
    { panel: "a wide", viewport: WIDE, mode: "unicode", legend: "moins · ░ ▒ ▓ █ plus" },
    { panel: "a narrow", viewport: NARROW, mode: "unicode", legend: "moins · ░ ▒ ▓ █ plus" },
    { panel: "an ASCII", viewport: NARROW, mode: "ascii", legend: "moins . : + * # plus" },
  ] as const)("fits every tab in $panel panel", async ({ viewport, mode, legend }) => {
    const { journal } = await shown(scriptedSource(), { glyphMode: () => mode });

    for (const tab of ["1", "2", "3", "4"]) {
      journal.press(key(tab));
      const lines = journal.render(viewport);
      expect(lines.length).toBeLessThanOrEqual(viewport.height);
      for (const line of lines) expect(lineWidth(line)).toBeLessThanOrEqual(viewport.width);
    }
    journal.press(key("1"));
    expect(text(journal.render(viewport)).join("\n")).toContain(legend);
  });
});

describe("JournalPanel in English", () => {
  useLocale("en");

  it("names its tabs, its period and the activity at a glance", async () => {
    const { journal } = await shown();

    const screen = text(journal.render(WIDE));
    expect(journal.title).toBe("Journal · past 12 months");
    expect(screen[0]).toBe("▌1 Activity  2 Recurrence  3 Events  4 Debug");
    expect(screen.join("\n")).toContain("3 updates · 75% successful · 2 packages · 1 failure");
    expect(screen.join("\n")).toContain("less · ░ ▒ ▓ █ more");
    expect(journal.hints()).toBe("1-4 tabs · p period · o HTML report · e export · r reload");
  });

  it("keeps the event rows within the panel, English dates being a column wider", async () => {
    const { journal } = await shown();
    journal.press(key("3"));

    for (const viewport of [WIDE, NARROW]) {
      for (const line of journal.render(viewport)) expect(lineWidth(line)).toBeLessThanOrEqual(viewport.width);
    }
    const rows = text(journal.render(WIDE)).map((line) => line.trimEnd());
    expect(rows[1]).toBe("type: all (f) · 7 events");
    expect(rows[2]).toMatch(/^› Oct 03 00:00 {2}◌ scan {4}1 provider · 7 outdated +1\.0 s$/);
    expect(rows.join("\n")).toMatch(/× failed +choco +nodejs/);
  });
});
