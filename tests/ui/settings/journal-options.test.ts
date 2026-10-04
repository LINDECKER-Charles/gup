import { afterEach, describe, expect, it } from "vitest";
import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../../src/core/runner.js";
import { fileSection } from "../../../src/ui/panels/options/file-section.js";
import { OptionsPanel } from "../../../src/ui/panels/options/options-panel.js";
import {
  journalOptions,
  type LogLevelInEffect,
} from "../../../src/ui/settings/journal-options.js";
import {
  JOURNAL_OPTION_HINTS,
  JOURNAL_OPTIONS_TITLE,
} from "../../../src/ui/text/settings/journal-options-labels.js";
import { key, optionsFixture, settle, text, VIEW } from "../panels/options/options-fixture.js";

const INITIAL_TIMEOUT_S = getInstallTimeoutSeconds();
afterEach(() => setInstallTimeoutSeconds(INITIAL_TIMEOUT_S));

function setup(logLevel: LogLevelInEffect = { threshold: "info", source: "default" }) {
  const fixture = optionsFixture();
  const sections = [journalOptions({ logLevel: () => logLevel }), fileSection];
  return { ...fixture, panel: new OptionsPanel(sections, fixture.host) };
}

function press(panel: OptionsPanel, ...names: string[]): void {
  for (const name of names) panel.press(key(name));
}

/** The row holding `label`, as text. */
function row(panel: OptionsPanel, label: string): string {
  return text(panel.render(VIEW)).split("\n").find((line) => line.includes(label)) ?? "";
}

describe("Options › JOURNAL", () => {
  it("shows the debug log level, the Journal's period and the report switch", () => {
    const { panel } = setup();
    const lines = text(panel.render(VIEW));
    expect(lines).toContain(JOURNAL_OPTIONS_TITLE);
    expect(row(panel, "Journal de debug")).toMatch(/\[info\] +debug pour un rapport de bug/);
    expect(row(panel, "Période du journal")).toContain("[12 derniers mois]");
    expect(row(panel, "Ouvrir le rapport")).toContain("[ON]");
  });

  it("saves each row in its own section of the settings", () => {
    const { panel, settings } = setup();
    press(panel, "enter", "left", "left");
    expect(settings.get("log").level).toBe("warn");
    press(panel, "down", "enter");
    expect(settings.get("journal").period).toBe("all");
    press(panel, "down", "enter");
    expect(settings.get("journal")).toEqual({ period: "all", openReport: false });
    expect(row(panel, "Ouvrir le rapport")).toContain("[OFF]");
  });

  it("cycles the level from off to trace and back", () => {
    const { panel, settings } = setup();
    const levels: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      press(panel, "enter");
      levels.push(settings.get("log").level);
    }
    expect(levels).toEqual(["debug", "trace", "off", "error", "warn", "info"]);
    expect(row(panel, "Journal de debug")).toContain("[info]");
  });

  it("says when --log-level or GUP_LOG_LEVEL decide this run's level instead", () => {
    const { panel } = setup({ threshold: "off", source: "env" });
    expect(row(panel, "Journal de debug")).toContain(JOURNAL_OPTION_HINTS.overridden("GUP_LOG_LEVEL", "désactivé"));
    const flagged = setup({ threshold: "trace", source: "flag" });
    expect(row(flagged.panel, "Journal de debug")).toContain("imposé par --log-level (trace)");
  });

  it("goes back to its defaults with Réinitialiser › Tout", async () => {
    const fixture = setup();
    fixture.settings.update("log", { level: "debug" });
    fixture.settings.update("journal", { period: "30d", openReport: false });
    fixture.dialogs.choose.mockResolvedValue("all");
    fixture.dialogs.confirm.mockResolvedValue(true);

    press(fixture.panel, "end", "up", "enter");
    await settle();

    expect(fixture.settings.get("log")).toEqual({ level: "info" });
    expect(fixture.settings.get("journal")).toEqual({ period: "12m", openReport: true });
  });
});
