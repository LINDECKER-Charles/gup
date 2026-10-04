import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type { ScanEvents } from "../../../src/ui/panels/scan-panel.js";
import { CONFIRM_UPDATE, NO_SCAN_YET, updateCountFact } from "../../../src/ui/text/menu-labels.js";
import {
  LAUNCH_NOTICES,
  PACKAGES_HINTS,
  SELECTION_BAR,
} from "../../../src/ui/text/packages-labels.js";
import { bootMenu, type MenuDriver } from "../../support/tui/menu-driver.js";

const pkg = (id: string, current: string, latest: string) => ({ id, current, latest });
const WINGET: ProviderScanResult = {
  providerId: "winget",
  available: true,
  packages: [pkg("Git.Git", "2.51.0", "2.52.0"), pkg("7zip.7zip", "25.00", "25.01")],
};
const SIZE = { cols: 120, rows: 26 };

/** The menu after its launch scan found WINGET, on Paquets. */
async function scanned(): Promise<MenuDriver> {
  const menu = await bootMenu({ scans: [WINGET], size: SIZE });
  await menu.waitForText("Git.Git");
  return menu;
}

/** Click the first cell of `text` on screen. */
async function clickOn(menu: MenuDriver, text: string): Promise<void> {
  const rows = (await menu.frame()).split("\n");
  const y = rows.findIndex((row) => row.includes(text));
  expect(y, `"${text}" on screen`).toBeGreaterThanOrEqual(0);
  await menu.screen.mockMouse.click(rows[y]!.indexOf(text), y);
  await menu.screen.flush();
}

describe("Paquets", () => {
  it("claims no update count in the title bar before the first results", async () => {
    const menu = await bootMenu({ scanOnStart: false, initialView: "packages", size: SIZE });
    const [titleBar = ""] = (await menu.waitForText(NO_SCAN_YET)).split("\n");
    expect(titleBar).not.toContain(updateCountFact(0));
  });

  // npm's registry answering 503: no package, one error. Not "à jour".
  it("shows the failed scan and never claims `à jour` when a provider could not scan", async () => {
    const failed: ProviderScanResult = {
      providerId: "npm-g",
      available: true,
      packages: [],
      error: "npm outdated a échoué (E503)",
    };
    const menu = await bootMenu({ scans: [failed], size: SIZE });
    const frame = await menu.waitForText("npm outdated a échoué (E503)");
    const [titleBar = ""] = frame.split("\n");
    expect(titleBar).toContain("1 scan en échec");
    expect(titleBar).not.toContain(updateCountFact(0));
  });

  // Its neighbour reads `1 détecté`: the counts of one bar agree with their number alike.
  it("agrees the title bar's update count with its number", async () => {
    const [titleBar = ""] = (await (await scanned()).frame()).split("\n");
    expect(titleBar).toContain("1 détecté  │  2 mises à jour  │");
    expect(updateCountFact(1)).toBe("1 mise à jour");
    expect(updateCountFact(0, 2)).toBe("2 scans en échec");
  });

  it("updates nothing on Entrée with nothing checked, and says how to check", async () => {
    const menu = await scanned();
    await menu.press("down", "enter");
    const text = await menu.frame();
    expect(text).toContain(LAUNCH_NOTICES.empty);
    expect(text).not.toContain(CONFIRM_UPDATE.heading(1));
    expect(text).toContain(PACKAGES_HINTS.checkAll);
  });

  it("says how to check above the bar at 80 × 24, then the count and button", async () => {
    const menu = await bootMenu({ scans: [WINGET], size: { cols: 80, rows: 24 } });
    const rows = (await menu.waitForText("Git.Git")).split("\n");
    // Bottom up: the key hints, the panel's border, the bar, the row above it.
    expect(rows.at(-3)).toContain(SELECTION_BAR.nothingChecked);
    expect(rows.at(-4)).toContain(SELECTION_BAR.howToCheck);
    await menu.press("a");
    expect((await menu.frame()).split("\n").at(-3)).toMatch(/● 2 sur 2 coché\(s\) +▐ Entrée/);
  });

  it("checks everything with a, then updates it all from a click on the bar", async () => {
    const menu = await scanned();
    await menu.press("a");
    const checked = await menu.frame();
    expect(checked).toContain(PACKAGES_HINTS.clearAll);
    // Launching is the selection bar's: the hint bar keeps its room for other keys.
    expect(checked).toContain(SELECTION_BAR.button(2));
    await clickOn(menu, "Mettre à jour (2)");
    expect(await menu.waitForText(CONFIRM_UPDATE.heading(2))).toContain("7zip.7zip");
    await menu.press("o");
    const ended = await menu.exit;
    if (ended.kind !== "outside") throw new Error(`session ended with ${ended.kind}`);
    await ended.run();
    const picked = vi.mocked(menu.controller.updateOutside).mock.calls[0]![0];
    expect(picked.map((p) => p.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("holds Entrée back while a rescan runs", async () => {
    let scans = 0;
    const scan = vi.fn(async (state: MenuState, events: ScanEvents) => {
      events.detecting();
      if (++scans > 1) return new Promise<void>(() => {});
      state.scans = [WINGET];
      state.detectedCount = 1;
    });
    const menu = await bootMenu({ scans: [WINGET], size: SIZE, controller: { scan } });
    await menu.waitForText("Git.Git");
    await menu.press("space", "r");
    expect(await menu.waitForText("détection")).toContain("┏━ Scan");
    await menu.press("tab", "down", "tab", "enter");
    const text = await menu.waitForText(LAUNCH_NOTICES.scanning);
    expect(text).toContain("┏━ Paquets");
    expect(text).not.toContain(CONFIRM_UPDATE.heading(2));
  });
});
