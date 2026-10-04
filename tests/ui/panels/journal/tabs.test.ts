import { describe, expect, it, vi } from "vitest";
import { JournalPanel, type JournalPanelDeps } from "../../../../src/ui/panels/journal/journal-panel.js";
import type { JournalData } from "../../../../src/ui/panels/journal/journal-source.js";
import type { Viewport } from "../../../../src/ui/panels/panel.js";
import { DEBUG_LABELS, EVENT_LABELS, JOURNAL_HINTS, RECURRENCE_LABELS } from "../../../../src/ui/text/journal/journal-labels.js";
import type { KeyPress } from "../../../../src/ui/tui/screen-host.js";
import type { Line } from "../../../../src/ui/tui/styled-lines.js";
import { scanEvent, updateEvent } from "../../../support/history-fixtures.js";
import { JOURNAL_NOW, journalData, logRecord, scriptedSource } from "./journal-data.js";

const VIEWPORT: Viewport = { width: 100, height: 26 };

const key = (name: string): KeyPress => ({ name, ctrl: false, sequence: name.length === 1 ? name : "" });
const text = (lines: readonly Line[]) => lines.map((line) => line.map((segment) => segment.text).join("").trimEnd());

async function journalOn(tab: string, data: JournalData = journalData(), over: Partial<JournalPanelDeps> = {}) {
  const journal = new JournalPanel({
    source: scriptedSource(data),
    redraw: vi.fn(),
    choose: vi.fn(async () => undefined),
    glyphMode: () => "unicode",
    now: () => JOURNAL_NOW,
    ...over,
  });
  journal.onShow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  journal.press(key(tab));
  const press = (...names: string[]) => names.forEach((name) => journal.press(key(name)));
  const screen = () => text(journal.render(VIEWPORT));
  return { journal, press, screen };
}

describe("Événements", () => {
  it("lists every event newest first, each with a mark and a word", async () => {
    const { screen } = await journalOn("3");

    const lines = screen();
    expect(lines[1]).toBe(`${EVENT_LABELS.type("tous")} · 7 événements`);
    expect(lines[2]).toMatch(/^› 03\/10 00:00 {2}⟳ scan {4}1 provider · 7 en retard +1,0 s$/);
    expect(lines.join("\n")).toMatch(/✖ échec +choco +nodejs/);
    expect(lines.join("\n")).toMatch(/↷ ignorée +winget +Spotify\.Spotify/);
    expect(lines.join("\n")).toMatch(/✔ réussie +winget +Google\.Chrome +129\.0 → 130\.0/);
  });

  it("cycles the type shown with f", async () => {
    const { press, screen } = await journalOn("3");

    press("f", "f");

    expect(screen()[1]).toBe(`${EVENT_LABELS.type("échecs")} · 1 événement`);
    expect(screen()[2]).toMatch(/choco +nodejs/);
    press("f", "f", "f");
    expect(screen()[1]).toBe(`${EVENT_LABELS.type("tous")} · 7 événements`);
  });

  it("filters on what is typed after /, taking every key meanwhile", async () => {
    const { journal, press, screen } = await journalOn("3");

    press("/", "s", "p", "o", "t");
    expect(journal.isCapturingText).toBe(true);
    expect(journal.hints()).toBe(JOURNAL_HINTS.typing);
    expect(screen()).toContain("/ spot█");
    expect(screen().filter((line) => line.includes("Spotify"))).toHaveLength(1);
    press("return");
    expect(journal.isCapturingText).toBe(false);
    press("escape");
    expect(screen()[1]).toContain("7 événements");
  });

  it("opens an attempt with Entrée — message included — and goes back with Échap", async () => {
    const { journal, press, screen } = await journalOn("3");

    press("down", "down", "down", "return");

    const detail = screen().join("\n");
    expect(screen()[1]).toBe("Mise à jour · choco · nodejs");
    expect(detail).toMatch(/Statut +✖ échec/);
    expect(detail).toContain("exit code 1603\n  see the log");
    expect(journal.hints()).toBe(JOURNAL_HINTS.detail);
    press("2");
    expect(screen().join("\n")).toContain("Mise à jour · choco · nodejs");
    press("escape");
    expect(screen()[1]).toContain("7 événements");
  });

  it("opens a scan with each provider's result", async () => {
    const { press, screen } = await journalOn("3");

    press("end", "return");

    const detail = screen().join("\n");
    expect(detail).toContain("2 providers · 12 en retard");
    expect(detail).toMatch(/Déclencheur +menu/);
    expect(detail).toMatch(/winget +9 en retard · 12,4 s/);
    expect(detail).toMatch(/az +erreur : Please run 'az login'/);
  });

  it("shows a long package id and a long path in full, wrapped at the panel's edge", async () => {
    const packageId = `Microsoft.VisualStudio.${"BuildTools.".repeat(10)}Extra`;
    const path = `C:\\${"dossier\\".repeat(20)}package.json`;
    const failure = updateEvent("winget", packageId, { status: "failed", message: `ENOENT: ${path}` });
    const { press, screen } = await journalOn("3", journalData([failure]));

    press("return");

    const detail = screen();
    for (const line of detail) expect(line.length).toBeLessThanOrEqual(VIEWPORT.width);
    const joined = detail.map((line) => line.trim()).join("");
    expect(joined).toContain(packageId);
    expect(joined).toContain(path);
  });
});

describe("Récurrence", () => {
  it("draws a bar per package, most updated first, with its pace", async () => {
    const { screen } = await journalOn("2");

    const lines = screen();
    // The title, then the sort mode pushed right: only spaces between the two.
    const header = `${RECURRENCE_LABELS.title} ${RECURRENCE_LABELS.sort("fréquence")}`;
    expect(lines[1]?.replace(/ +/g, " ")).toBe(header);
    expect(lines[3]).toMatch(/^› Google\.Chrome +winget +█+ +2 +~7 j hebdo\.$/);
    expect(lines.join("\n")).toMatch(/nodejs +choco +0 +— —/);
  });

  it("orders by failures, the bars then counting them, then by recency, with s", async () => {
    const { press, screen } = await journalOn("2");

    press("s");
    expect(screen()[1]).toContain(RECURRENCE_LABELS.sort("échecs"));
    expect(screen()[2]).toMatch(/Provider +Échecs +Rythme/);
    expect(screen()[3]).toMatch(/^› nodejs +choco +█+ +1 /);
    expect(screen()[4]).toMatch(/^ {2}Google\.Chrome +winget +0 /);
    press("s");
    expect(screen()[2]).toMatch(/Provider +Mises à jour +Rythme/);
    expect(screen()[3]).toMatch(/^› Google\.Chrome/);
  });

  it("opens a package: counts, pace, first and last attempt, versions", async () => {
    const { press, screen } = await journalOn("2");

    press("return");

    const detail = screen().join("\n");
    expect(screen()[1]).toBe("Google.Chrome · winget");
    expect(detail).toMatch(/Mises à jour réussies +2/);
    expect(detail).toMatch(/Intervalle médian +~7 j/);
    expect(detail).toMatch(/Rythme +hebdomadaire/);
    expect(detail).toContain(RECURRENCE_LABELS.versions);
    expect(detail).toMatch(/02\/10\/2026 {2}129\.0 → 130\.0\n {2}25\/09\/2026 {2}128\.0 → 129\.0/);
  });
});

describe("provider names", () => {
  // The names every other view shows, from the menu's own lookup.
  const DISPLAY_NAMES: Readonly<Record<string, string>> = {
    winget: "Winget",
    choco: "Chocolatey",
    "npm-g": "npm (global)",
    az: "Azure CLI",
  };
  const named = { providerName: (providerId: string) => DISPLAY_NAMES[providerId] ?? providerId };

  it("names providers in Événements' rows and details, and filters on those names", async () => {
    const { press, screen } = await journalOn("3", journalData(), named);

    expect(screen().join("\n")).toMatch(/✖ échec +Chocolatey +nodejs/);
    expect(screen().join("\n")).toMatch(/✔ réussie +npm \(global\) +typescript/);
    expect(screen().join("\n")).not.toMatch(/ choco | npm-g /);
    press("/", ...[..."chocolatey"], "return");
    expect(screen()[1]).toContain("1 événement");
    press("escape", "escape", "down", "down", "down", "return");
    expect(screen()[1]).toBe("Mise à jour · Chocolatey · nodejs");
    press("escape", "end", "return");
    expect(screen().join("\n")).toMatch(/Winget +9 en retard · 12,4 s/);
    expect(screen().join("\n")).toMatch(/Azure CLI +erreur : Please run 'az login'/);
  });

  it("names the providers a scan was filtered to in its detail", async () => {
    const filtered = scanEvent({
      ts: "2026-10-02T12:00:00.000Z",
      filter: ["choco", "npm-g"],
      providers: [{ providerId: "choco", outdated: 1, durationMs: 2_000 }],
    });
    const { press, screen } = await journalOn("3", journalData([filtered]), named);

    press("return");

    expect(screen().join("\n")).toMatch(/Providers +Chocolatey, npm \(global\)\n/);
  });

  it("still finds an event by its provider's id", async () => {
    const { press, screen } = await journalOn("3", journalData(), named);

    press("/", ..."npm-g", "return");

    expect(screen()[1]).toContain("1 événement");
  });

  it("names providers in Récurrence's rows and details", async () => {
    const { press, screen } = await journalOn("2", journalData(), named);

    expect(screen()[3]).toMatch(/^› Google\.Chrome +Winget +█+ +2 /);
    expect(screen().join("\n")).toMatch(/nodejs +Chocolatey +0 /);
    press("return");
    expect(screen()[1]).toBe("Google.Chrome · Winget");
  });

  it("names the slowest scans of Activité", async () => {
    const { screen } = await journalOn("1", journalData(), named);

    expect(screen().join("\n")).toMatch(/Scans les plus lents +Winget 10,7 s/);
  });
});

describe("Debug", () => {
  it("lists the log newest first under what this run writes", async () => {
    const { screen } = await journalOn("4");

    const lines = screen();
    expect(lines[1]).toBe(`${DEBUG_LABELS.level("tout")} · ${DEBUG_LABELS.writing("info", "défaut")} · 3 lignes`);
    expect(lines[2]).toMatch(/^› 03\/10 11:00:03\.000 {2}ERREUR session\.crash +boom$/);
    expect(lines[3]).toMatch(/AVERT\. cmd\.end +\[az\] az version · exit 1 · 0,4 s$/);
  });

  it("narrows the levels shown with l, the levels written untouched", async () => {
    const { press, screen } = await journalOn("4");

    press("l", "l", "l");

    expect(screen()[1]).toBe(`${DEBUG_LABELS.level("≥ avert.")} · ${DEBUG_LABELS.writing("info", "défaut")} · 2 lignes`);
    press("l", "l");
    expect(screen()[1]).toContain("3 lignes");
  });

  it("opens a record with its context and data", async () => {
    const { press, screen } = await journalOn("4");

    press("down", "return");

    const detail = screen().join("\n");
    expect(screen()[1]).toBe("AVERT. cmd.end");
    // TZ=UTC here: the local time the list shows, then the instant as logged.
    expect(detail).toMatch(/Heure +03\/10 11:00:02\.000 \(2026-10-03T11:00:02\.000Z\)/);
    expect(detail).toMatch(/Contexte +scan · az/);
    expect(detail).toContain(`${DEBUG_LABELS.data}\n  {\n    "cmd": "az",`);
  });

  it("wraps a long value of a record's data instead of cutting it", async () => {
    const stderr = "e".repeat(300);
    const record = logRecord({ level: "warn", event: "cmd.end", data: { cmd: "npm", stderr } });
    const { press, screen } = await journalOn("4", journalData(undefined, { log: { records: [record] } }));

    press("return");

    const detail = screen();
    for (const line of detail) expect(line.length).toBeLessThanOrEqual(VIEWPORT.width);
    expect(detail.map((line) => line.trim()).join("")).toContain(`"stderr":"${stderr}"`);
  });

  it("says when this run writes no log, and counts what could not be read", async () => {
    const data = journalData(undefined, {
      log: { threshold: "off", source: "env", records: [], malformed: 2 },
      history: { stats: { files: 1, lines: 9, malformed: 3, unsupported: 1 } },
    });
    const { screen } = await journalOn("4", data);

    const lines = screen().join("\n");
    expect(lines).toContain(DEBUG_LABELS.off);
    expect(lines).toContain(DEBUG_LABELS.offHint.env);
    expect(lines).toContain(DEBUG_LABELS.empty);
    expect(lines).toContain(DEBUG_LABELS.historySkipped(3));
    expect(lines).toContain(DEBUG_LABELS.historyNewer(1));
    expect(lines).toContain(DEBUG_LABELS.logSkipped(2));
  });

  it("points to Options when the setting turned the log off", async () => {
    const data = journalData(undefined, { log: { threshold: "off", source: "setting" } });
    const { screen } = await journalOn("4", data);

    expect(screen().join("\n")).toContain("Activez-le dans Options › Journal de debug.");
  });

  it("wraps the off hint in the panel an 80-column terminal leaves", async () => {
    const data = journalData(undefined, { log: { threshold: "off", source: "env" } });
    const { journal } = await journalOn("4", data);

    const lines = text(journal.render({ width: 50, height: 22 }));
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(50);
    expect(lines.join(" ")).toContain(DEBUG_LABELS.offHint.env);
  });
});
