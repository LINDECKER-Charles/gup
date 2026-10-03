import { afterEach, describe, expect, it, vi } from "vitest";
import type { JournalData, JournalSource } from "../../../src/ui/panels/journal/journal-source.js";
import { journalView } from "../../../src/ui/views/journal-view.js";
import { bootMenu, defaultViews } from "../../support/tui/menu-driver.js";
import { journalData, scriptedSource } from "../panels/journal/journal-data.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function journalMenu(
  size: { cols: number; rows: number },
  source: JournalSource = scriptedSource(),
) {
  const menu = await bootMenu({
    views: [...defaultViews(), journalView(source)],
    initialView: "journal",
    scanOnStart: false,
    size,
  });
  return { menu, source };
}

/** Every row of the frame fits the terminal. */
function expectFits(frame: string, cols: number, rows: number): void {
  const lines = frame.split("\n");
  expect(lines.length).toBeLessThanOrEqual(rows);
  for (const line of lines) expect([...line].length).toBeLessThanOrEqual(cols);
}

describe("journal view", () => {
  it("sits in the sidebar between Providers and Options, and loads when shown", async () => {
    const { menu, source } = await journalMenu({ cols: 120, rows: 30 });

    const frame = await menu.waitForText("Journal · 12 derniers mois ");

    expect(source.load).toHaveBeenCalledTimes(1);
    expect(frame).toMatch(/Providers[\s\S]*Journal[\s\S]*Options/);
    expect(frame).toContain("▌1 Activité  2 Récurrence  3 Événements  4 Debug");
    expect(frame).toContain("Mises à jour réussies par jour");
    expectFits(frame, 120, 30);
  });

  it("fits an 80×24 terminal on every tab", async () => {
    const { menu } = await journalMenu({ cols: 80, rows: 24 });
    await menu.waitForText("Mises à jour réussies par jour");

    for (const [tab, marker] of [
      ["2", "Paquets les plus souvent"],
      ["3", "type : tous (f)"],
      ["4", "niveau tout (l)"],
      ["1", "Mises à jour réussies par jour"],
    ] as const) {
      await menu.press(tab);
      const frame = await menu.waitForText(marker);
      expectFits(frame, 80, 24);
    }
  });

  it("draws with ASCII symbols when the terminal needs them", async () => {
    vi.stubEnv("GUP_ASCII", "1");
    const { menu } = await journalMenu({ cols: 120, rows: 30 });

    const frame = await menu.waitForText("moins . : + * # plus");

    expect(frame).not.toMatch(/[░▒▓█▌·→✔✖]/);
    expect(frame).toContain("|1 Activit");
  });

  it("lets a load finish after the user quit, drawing nothing", async () => {
    let finishLoad: (data: JournalData) => void = () => {};
    const late = new Promise<JournalData>((resolve) => (finishLoad = resolve));
    const source = { load: vi.fn(() => late), export: vi.fn() };
    const { menu } = await journalMenu({ cols: 100, rows: 30 }, source);

    await menu.press("q");
    await expect(menu.exit).resolves.toEqual({ kind: "quit" });
    finishLoad(journalData());
    // A redraw on the destroyed screen would surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("exports through the dialog the e key opens", async () => {
    const { menu, source } = await journalMenu({ cols: 120, rows: 30 }, scriptedSource(journalData()));
    await menu.waitForText("Mises à jour réussies par jour");

    await menu.press("e");
    await menu.waitForText("Exporter le journal");
    await menu.press("down", "enter");

    await menu.waitForText("Export écrit");
    expect(source.export).toHaveBeenCalledWith("csv", expect.objectContaining({ key: "12m" }));
  });
});
