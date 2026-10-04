import { describe, expect, it } from "vitest";
import { appearanceSection } from "../../../../src/ui/panels/options/appearance-section.js";
import { OptionsPanel } from "../../../../src/ui/panels/options/options-panel.js";
import {
  CONTRAST_STATUS,
  THEME_LABELS,
  THEME_PICKER,
  THEME_UNAVAILABLE_16,
} from "../../../../src/ui/text/settings/theme-labels.js";
import {
  key,
  lineWith,
  optionsFixture,
  text,
  TRUECOLOR_UNKNOWN,
  VIEW,
  type FixtureOptions,
} from "./options-fixture.js";

/** The Options list with the picker open on the saved theme. */
function openPicker(options: FixtureOptions & { readonly saved?: "dark" | "terminal" } = {}) {
  const fixture = optionsFixture(options);
  fixture.settings.update("theme", { id: options.saved ?? "dark" });
  const panel = new OptionsPanel([appearanceSection], fixture.host);
  panel.press(key("enter"));
  return { ...fixture, panel };
}

describe("theme picker", () => {
  it("opens on the saved theme and lists each theme's lowest contrast", () => {
    const { panel } = openPicker();
    expect(panel.title).toBe(`Options › ${THEME_PICKER.title}`);
    const lines = panel.render(VIEW);
    expect(text([lineWith(lines, THEME_LABELS.dark)])).toMatch(/^› Sombre \(gup\)\s+✔ 6,1/);
    expect(text([lineWith(lines, THEME_LABELS["high-contrast"])])).toContain("✔ 7,8");
    expect(text([lineWith(lines, THEME_LABELS.terminal)])).toContain("? —");
    expect(text(lines)).toContain(THEME_PICKER.report(6.14, "AA"));
  });

  it("previews the theme under the cursor and saves nothing until Entrée", () => {
    const { panel, appearance, settings, previewed } = openPicker();
    panel.press(key("down"));
    expect(previewed()).toMatchObject({ id: "light", contrast: "AA" });
    expect(text(panel.render(VIEW))).toContain("Fond peint par gup");
    expect(settings.get("theme").id).toBe("dark");
    panel.press(key("up"));
    expect(appearance.endPreview).toHaveBeenCalled();
    expect(previewed()).toBeNull();
  });

  it("goes back to the saved theme on Échap", () => {
    const { panel, settings, previewed } = openPicker();
    panel.press(key("down"));
    panel.press(key("escape"));
    expect(previewed()).toBeNull();
    expect(settings.get("theme").id).toBe("dark");
    expect(panel.title).toBe("Options");
  });

  it("saves the theme under the cursor on Entrée and closes", () => {
    const { panel, settings, previewed } = openPicker();
    panel.press(key("down"));
    panel.press(key("enter"));
    expect(settings.get("theme").id).toBe("light");
    expect(previewed()).toBeNull();
    expect(panel.title).toBe("Options");
  });

  it("keeps a saved theme's custom colours and level when trying others", () => {
    const fixture = optionsFixture();
    fixture.settings.update("theme", { id: "dark", contrast: "AAA" });
    const panel = new OptionsPanel([appearanceSection], fixture.host);
    panel.press(key("enter"));
    panel.press(key("down"));
    expect(fixture.previewed()).toMatchObject({ id: "light", contrast: "AAA" });
  });

  it("says once when the terminal palette is unknown and the contrast cannot be checked", () => {
    const { panel } = openPicker({ saved: "terminal" });
    const shown = text(panel.render(VIEW));
    expect(shown).toContain(CONTRAST_STATUS.unverified.slice(0, 30));
    expect(shown).toContain(THEME_PICKER.modeNotes.trusted.slice(0, 30));
    expect(shown.match(/inconnue/gi)).toHaveLength(1);
  });

  it("shows what a 16-colour terminal cannot paint, and refuses to apply it", () => {
    const { panel, settings, previewed } = openPicker({
      saved: "terminal",
      terminal: { ...TRUECOLOR_UNKNOWN, depth: "16" },
    });
    panel.press(key("down"));
    panel.press(key("down"));
    expect(previewed()).toBeNull();
    const lines = panel.render(VIEW);
    expect(text([lineWith(lines, THEME_LABELS.dark)])).toMatch(/Sombre \(gup\)\s+–/);
    expect(text(lines)).toContain(THEME_UNAVAILABLE_16);
    panel.press(key("enter"));
    expect(settings.get("theme").id).toBe("terminal");
    expect(panel.title).toContain(THEME_PICKER.title);
  });

  it("tries the theme a click lands on", () => {
    const { panel, previewed } = openPicker();
    panel.click(5, VIEW);
    expect(previewed()?.id).toBe("high-contrast");
  });

  it("puts the preview under the list on a narrow panel", () => {
    const { panel } = openPicker();
    const lines = text(panel.render({ width: 50, height: 40 })).split("\n");
    const listEnd = lines.findIndex((line) => line.includes(THEME_LABELS.monochrome));
    expect(lines.findIndex((line) => line.includes(THEME_PICKER.previewHeading))).toBeGreaterThan(
      listEnd,
    );
    expect(panel.render({ width: 50, height: 12 })).toHaveLength(12);
  });

  it("gives the contrast verdict before the sample under the list, so a short panel keeps it", () => {
    const { panel } = openPicker();
    const lines = text(panel.render({ width: 50, height: 20 })).split("\n");
    expect(lines).toContain(THEME_PICKER.report(6.14, "AA"));
  });
});
