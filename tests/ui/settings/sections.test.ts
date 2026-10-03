import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../../../src/core/config/store.js";
import { DEFAULT_UI_PREFERENCES } from "../../../src/ui/app/ui-preferences.js";
import { INTERFACE_SECTION } from "../../../src/ui/settings/interface-section.js";
import { THEME_SECTION } from "../../../src/ui/settings/theme-section.js";

let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-ui-sections-")), "config.json");
});

async function storeWith(sections: unknown): Promise<ConfigStore> {
  await writeFile(file, JSON.stringify({ version: 1, sections }), "utf8");
  return new ConfigStore({ file });
}

describe("THEME_SECTION", () => {
  it("defaults to the terminal's own palette at AA, nothing customised", () => {
    expect(THEME_SECTION.defaults).toEqual({ id: "terminal", contrast: "AA", custom: {} });
  });

  it("reads the theme, the level and each theme's own colours, normalised", async () => {
    const store = await storeWith({
      theme: {
        v: 1,
        id: "dark",
        contrast: "AAA",
        custom: { dark: { accent: "#f80", danger: "#B00020" }, light: { text: "#111111" } },
      },
    });
    expect(store.read(THEME_SECTION)).toEqual({
      id: "dark",
      contrast: "AAA",
      custom: { dark: { accent: "#FF8800", danger: "#B00020" }, light: { text: "#111111" } },
    });
  });

  it("drops a bad colour or an unknown role but keeps the rest of that theme", async () => {
    const store = await storeWith({
      theme: { v: 1, custom: { dark: { accent: "orange", success: "#00AA00", glow: "#FFFFFF" } } },
    });
    expect(store.read(THEME_SECTION).custom).toEqual({ dark: { success: "#00AA00" } });
    expect(store.status().issues).toEqual(["theme.custom.dark.accent : couleur #RRGGBB attendue"]);
  });

  it("skips themes this build does not know and never reads prototype keys", async () => {
    const raw = '{"version":1,"sections":{"theme":{"v":1,"id":"neon","custom":' +
      '{"neon":{"accent":"#FFFFFF"},"__proto__":{"accent":"#000000"}}}}}';
    await writeFile(file, raw, "utf8");
    const store = new ConfigStore({ file });
    expect(store.read(THEME_SECTION)).toEqual({ id: "terminal", contrast: "AA", custom: {} });
    expect(({} as Record<string, unknown>)["accent"]).toBeUndefined();
  });
});

describe("INTERFACE_SECTION", () => {
  it("takes its menu defaults from the menu's own preferences", () => {
    const { scan: _scan, ...menuDefaults } = DEFAULT_UI_PREFERENCES;
    const { density: _density, glyphs: _glyphs, mouse: _mouse, ...menuFields } =
      INTERFACE_SECTION.defaults;
    expect(menuFields).toEqual(menuDefaults);
  });

  it("defaults the screens to the comfortable density, automatic symbols and the mouse", () => {
    const { density, glyphs, mouse } = INTERFACE_SECTION.defaults;
    expect({ density, glyphs, mouse }).toEqual({
      density: "comfortable",
      glyphs: "auto",
      mouse: true,
    });
  });

  it("reads every field and falls back per field", async () => {
    const store = await storeWith({
      interface: {
        v: 1,
        launchView: "providers",
        packageSort: "bump",
        noteColumn: "hidden",
        density: "compact",
        glyphs: "ascii",
        mouse: false,
        animations: "no",
      },
    });
    expect(store.read(INTERFACE_SECTION)).toMatchObject({
      launchView: "providers",
      packageSort: "bump",
      noteColumn: "hidden",
      density: "compact",
      glyphs: "ascii",
      mouse: false,
      animations: true,
    });
    expect(store.status().issues).toEqual(["interface.animations : booléen attendu"]);
  });
});
