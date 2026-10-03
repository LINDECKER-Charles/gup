import { afterEach, describe, expect, it, vi } from "vitest";
import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import { readProviderStatus } from "../../../src/core/platform/provider-status.js";
import type { ProviderStatusReport } from "../../../src/core/platform/types.js";
import { ALL_PROVIDERS } from "../../../src/core/registry.js";
import { ProvidersPanel } from "../../../src/ui/panels/providers-panel.js";
import type { Line } from "../../../src/ui/tui/styled-lines.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

const VIEW = { width: 100, height: 40 };
/** The main panel's room inside an 80-column terminal (sidebar and borders taken). */
const PANEL_AT_80_COLUMNS = 52;
const lineText = (line: Line) => line.map((s) => s.text).join("");
const text = (lines: readonly Line[]) => lines.map(lineText).join("\n");

const MAC_REPORT: ProviderStatusReport = {
  platform: "darwin",
  detected: [{ id: "brew", displayName: "Homebrew", platforms: PLATFORMS.notWindows }],
  missing: [{ id: "macports", displayName: "MacPorts", installHint: "https://www.macports.org" }],
  incompatible: [
    {
      id: "winget",
      displayName: "Winget",
      installHint: "https://aka.ms/getwinget",
      platforms: PLATFORMS.windows,
    },
  ],
};

function shown(report: ProviderStatusReport, showIncompatible?: () => boolean): ProvidersPanel {
  const panel = new ProvidersPanel(vi.fn(), showIncompatible ? { showIncompatible } : {});
  panel.setData(report);
  return panel;
}

const rowOf = (panel: ProvidersPanel, id: string) =>
  panel.render(VIEW).find((line) => line.some((s) => s.text.trim() === id));

describe("ProvidersPanel", () => {
  it("sums the groups up, then lists detected, missing and incompatible providers", () => {
    const lines = shown(MAC_REPORT).render(VIEW).map(lineText);
    expect(lines[0]).toBe("1 détecté(s) · 1 non installé(s) · 1 incompatible(s) avec macOS");
    const headers = lines.filter((line) => /^\S/.test(line)).slice(1);
    expect(headers).toEqual([
      "● Détectés (1)",
      "○ Non installés / hors PATH (1)",
      "– Incompatibles avec macOS (1)",
    ]);
    expect(lines).toContain("      → https://www.macports.org");
  });

  it("badges an incompatible provider with where it runs, and gives no install hint", () => {
    const panel = shown(MAC_REPORT);
    expect(lineText(rowOf(panel, "winget") ?? [])).toBe(
      `  – ${"Winget".padEnd(30)} winget Windows uniquement`,
    );
    expect(text(panel.render(VIEW))).not.toContain("aka.ms");
  });

  it("explains the group, then keeps every badge whole and aligned on a narrow panel", () => {
    const report: ProviderStatusReport = {
      platform: "darwin",
      detected: [],
      missing: [],
      incompatible: [
        { id: "winget", displayName: "Winget", platforms: PLATFORMS.windows },
        { id: "rancher-desktop", displayName: "Rancher Desktop", platforms: PLATFORMS.windows },
        { id: "visual-studio", displayName: "Visual Studio", platforms: PLATFORMS.windows },
      ],
    };
    const narrow = { width: 50, height: 40 };
    const lines = shown(report).render(narrow).map(lineText);
    const note = lines.slice(lines.indexOf("– Incompatibles avec macOS (3)") + 1, -3);
    expect(note.join(" ").replace(/\s+/g, " ").trim()).toBe(
      "Réservés à un autre système : gup ne les détecte ni ne les met à jour ici.",
    );
    const rows = lines.slice(-3);
    for (const row of [...note, ...rows]) expect(row.length).toBeLessThanOrEqual(narrow.width);
    expect(rows.every((row) => row.endsWith("Windows uniquement"))).toBe(true);
    expect(new Set(rows.map((row) => row.indexOf("Windows uniquement"))).size).toBe(1);
  });

  it("keeps a gap after a name exactly as wide as its column", () => {
    const xcodes = {
      id: "xcodes",
      displayName: "xcodes (Xcode version manager)",
      platforms: PLATFORMS.macos,
    };
    const panel = shown({ ...MAC_REPORT, platform: "win32", incompatible: [xcodes] });
    expect(lineText(rowOf(panel, "xcodes") ?? [])).toContain("manager) xcodes ");
  });

  it("paints every part of an incompatible row as disabled", () => {
    const row = rowOf(shown(MAC_REPORT), "winget");
    expect(row?.map((s) => s.tone)).toEqual(["disabled", "disabled", "disabled", "disabled"]);
  });

  it("names the OS of the report in the incompatible header", () => {
    const report = {
      ...MAC_REPORT,
      platform: "win32" as const,
      incompatible: [{ id: "mas", displayName: "Mac App Store", platforms: PLATFORMS.macos }],
    };
    expect(text(shown(report).render(VIEW))).toContain("– Incompatibles avec Windows (1)");
  });

  it("wraps the summary between its parts on a narrow panel, never inside one", () => {
    const report = { ...MAC_REPORT, missing: Array(131).fill(MAC_REPORT.missing[0]) };
    const lines = shown(report).render({ width: PANEL_AT_80_COLUMNS, height: 40 }).map(lineText);
    expect(lines.slice(0, 2)).toEqual([
      "1 détecté(s) · 131 non installé(s)",
      "1 incompatible(s) avec macOS",
    ]);
  });

  it("omits the incompatible group and its count when there is none", () => {
    const out = text(shown({ ...MAC_REPORT, incompatible: [] }).render(VIEW));
    expect(out.split("\n")[0]).toBe("1 détecté(s) · 1 non installé(s)");
    expect(out).not.toContain("Incompatibles");
  });

  it("hides the incompatible group while the preference is off, live", () => {
    let isShown = false;
    const panel = shown(MAC_REPORT, () => isShown);
    expect(text(panel.render(VIEW))).not.toContain("incompatible");
    isShown = true;
    expect(text(panel.render(VIEW))).toContain("Incompatibles avec macOS (1)");
  });

  it("never scrolls past the end once the incompatible group is hidden", () => {
    let isShown = true;
    const panel = shown(MAC_REPORT, () => isShown);
    panel.scroll(100);
    isShown = false;
    expect(panel.render(VIEW)).toHaveLength(1);
  });

  it("starts loading the first time it is shown, and only then", () => {
    const load = vi.fn();
    const panel = new ProvidersPanel(load);
    expect(text(panel.render(VIEW))).toContain("détection des providers");
    panel.onShow();
    panel.onShow();
    expect(load).toHaveBeenCalledOnce();
  });
});

describe("ProvidersPanel: the real registry on each OS", () => {
  const OSES = [
    ["darwin", "macOS"],
    ["linux", "Linux"],
    ["win32", "Windows"],
  ] as const;

  afterEach(() => {
    vi.restoreAllMocks();
    restorePlatform();
  });

  /** What gup reports on `platform` when nothing at all is installed. */
  async function reportOn(platform: NodeJS.Platform): Promise<ProviderStatusReport> {
    setPlatform(platform);
    for (const provider of ALL_PROVIDERS) {
      vi.spyOn(provider, "isAvailable").mockResolvedValue(false);
    }
    return readProviderStatus();
  }

  it.each(OSES)("greys out every provider foreign to %s, whole at 80 columns", async (os, name) => {
    const report = await reportOn(os);
    const lines = shown(report).render({ width: PANEL_AT_80_COLUMNS, height: 1000 });
    const count = report.incompatible.length;
    expect(lines.slice(0, 2).map(lineText)).toContain(`${count} incompatible(s) avec ${name}`);
    expect(lines.map(lineText)).toContain(`– Incompatibles avec ${name} (${count})`);
    const rows = lines.slice(-count);
    const badgeColumns = new Set<number>();
    rows.forEach((row, index) => {
      const badge = row.at(-1)?.text ?? "";
      expect(row.every((part) => part.tone === "disabled")).toBe(true);
      expect(lineText(row)).toContain(` ${report.incompatible[index]?.id} `);
      expect(badge).toMatch(/^(Windows|macOS|macOS\/Linux) uniquement$/);
      expect(lineText(row).length).toBeLessThanOrEqual(PANEL_AT_80_COLUMNS);
      badgeColumns.add(lineText(row).length - badge.length);
    });
    expect(badgeColumns.size).toBe(1);
  });

  it("scrolls down to the last incompatible row on a narrow panel", async () => {
    const report = await reportOn("darwin");
    const panel = shown(report);
    panel.scroll(Number.MAX_SAFE_INTEGER);
    const screen = panel.render({ width: PANEL_AT_80_COLUMNS, height: 24 }).map(lineText);
    expect(screen.at(-1)).toContain(` ${report.incompatible.at(-1)?.id} `);
  });
});
