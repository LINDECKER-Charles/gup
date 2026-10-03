import { describe, expect, it } from "vitest";
import { appearanceSection } from "../../../../src/ui/panels/options/appearance-section.js";
import { OptionsPanel } from "../../../../src/ui/panels/options/options-panel.js";
import { COLOR_EDITOR, HEX_DIALOG } from "../../../../src/ui/text/settings/theme-labels.js";
import * as wcag from "../../../support/contrast/wcag.js";
import { key, lineWith, optionsFixture, settle, text, VIEW } from "./options-fixture.js";

/** The dark theme's background: unreadable as text on itself. */
const DARK_BACKGROUND = "#0B0D13";

/** The colour editor open on the dark theme, the cursor on "Accent". */
function openEditor() {
  const fixture = optionsFixture();
  fixture.settings.update("theme", { id: "dark" });
  const panel = new OptionsPanel([appearanceSection], fixture.host);
  for (const name of ["down", "enter"]) panel.press(key(name));
  return { ...fixture, panel };
}

/** Type `hex` for the role under the cursor. */
async function typeColor(editor: ReturnType<typeof openEditor>, hex: string): Promise<void> {
  editor.dialogs.ask.mockResolvedValueOnce(hex);
  editor.panel.press(key("enter"));
  await settle();
}

function luminanceOf(hex: string | undefined): number {
  return wcag.relativeLuminance(wcag.parseHexColor(hex ?? ""));
}

describe("colour editor", () => {
  it("shows each role's chosen and painted colour, with its contrast", () => {
    const { panel } = openEditor();
    expect(panel.title).toBe(`Options › ${COLOR_EDITOR.title}`);
    const lines = panel.render(VIEW);
    expect(text(lines)).toContain(COLOR_EDITOR.base("Sombre (gup)"));
    const accent = text([lineWith(lines, "Accent")]);
    expect(accent).toMatch(/^› Accent\s+\(thème\)\s+#9FA5FF\s+6,\d:1\s+✔/);
    expect(text([lineWith(lines, "Fond ")])).toContain(COLOR_EDITOR.samples.background);
  });

  it("saves a typed colour under the theme it belongs to, refusing anything but #RGB / #RRGGBB", async () => {
    const editor = openEditor();
    for (const name of ["down", "down", "down"]) editor.panel.press(key(name));
    await typeColor(editor, "#ff6b6b");
    const spec = editor.dialogs.ask.mock.calls[0]?.[0] as {
      title: string;
      validate(value: string): unknown;
    };
    expect(spec.title).toBe(HEX_DIALOG.title("Erreur"));
    expect(spec.validate("#12")).toBe(HEX_DIALOG.invalid);
    expect(spec.validate("rouge")).toBe(HEX_DIALOG.invalid);
    expect(spec.validate("#abc")).toBe(true);
    expect(editor.settings.get("theme").custom).toEqual({ dark: { danger: "#FF6B6B" } });
    expect(text([lineWith(editor.panel.render(VIEW), "Erreur")])).toContain("#FF6B6B");
  });

  it("shows an unreadable colour moved to a readable one, and a keeps the moved colour", async () => {
    const editor = openEditor();
    await typeColor(editor, DARK_BACKGROUND);
    const lines = editor.panel.render(VIEW);
    const accent = text([lineWith(lines, "Accent")]);
    expect(accent).toContain(DARK_BACKGROUND);
    expect(accent).toMatch(/1,0 → \d+,\d:1 ⚠/);
    expect(text(lines)).toContain(COLOR_EDITOR.corrected(1, "AA"));
    editor.panel.press(key("a"));
    const kept = editor.settings.get("theme").custom.dark?.accent;
    expect(kept).not.toBe(DARK_BACKGROUND);
    const ratio = wcag.contrastRatio(
      wcag.parseHexColor(kept ?? ""),
      wcag.parseHexColor(DARK_BACKGROUND),
    );
    expect(ratio).toBeGreaterThanOrEqual(wcag.WCAG_MIN_CONTRAST.text);
    expect(text([lineWith(editor.panel.render(VIEW), "Accent")])).toMatch(/✔/);
  });

  it("keeps the contrast and its warning whole on a narrow panel, the painted colour left out", async () => {
    const editor = openEditor();
    await typeColor(editor, DARK_BACKGROUND);
    const narrow = editor.panel.render({ width: 50, height: 20 });
    expect(text(narrow)).not.toContain(COLOR_EDITOR.columns.shown);
    expect(text([lineWith(narrow, "Accent")])).toMatch(/1,0 → \d+,\d:1 ⚠/);
    expect(text(editor.panel.render(VIEW))).toContain(COLOR_EDITOR.columns.shown);
  });

  it("gives a role back to the theme with Suppr", async () => {
    const editor = openEditor();
    await typeColor(editor, "#FF8800");
    editor.panel.press(key("delete"));
    expect(editor.settings.get("theme").custom).toEqual({});
  });

  it("previews hue nudges on the whole app and saves them only when the user moves on", () => {
    const editor = openEditor();
    editor.panel.press(key("right"));
    const nudged = editor.previewed()?.custom.dark?.accent;
    expect(nudged).toBeDefined();
    expect(nudged).not.toBe("#9FA5FF");
    expect(editor.settings.get("theme").custom).toEqual({});
    editor.panel.press(key("down"));
    expect(editor.settings.get("theme").custom.dark?.accent).toBe(nudged);
    expect(editor.previewed()).toBeNull();
  });

  it("makes a colour lighter with + and darker with -, saved when leaving", () => {
    const editor = openEditor();
    editor.panel.press(key("+"));
    const lighter = editor.previewed()?.custom.dark?.accent;
    expect(luminanceOf(lighter)).toBeGreaterThan(luminanceOf("#9FA5FF"));
    editor.panel.press(key("-"));
    editor.panel.press(key("-"));
    const darker = editor.previewed()?.custom.dark?.accent;
    expect(luminanceOf(darker)).toBeLessThan(luminanceOf("#9FA5FF"));
    editor.panel.press(key("escape"));
    expect(editor.settings.get("theme").custom.dark?.accent).toBe(darker);
    expect(editor.panel.title).toBe("Options");
  });

  it("selects the role a click lands on", () => {
    const editor = openEditor();
    editor.panel.click(4, VIEW);
    expect(text([lineWith(editor.panel.render(VIEW), "Succès")])).toMatch(/^› Succès/);
  });
});
