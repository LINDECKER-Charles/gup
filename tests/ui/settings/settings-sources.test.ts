import { describe, expect, it, vi } from "vitest";
import { ConfigStore } from "../../../src/core/config/store.js";
import { DEFAULT_UI_PREFERENCES } from "../../../src/ui/app/ui-preferences.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";
import {
  appearanceSource,
  menuPreferencesSource,
} from "../../../src/ui/settings/settings-sources.js";

/** Settings on defaults, kept in memory only. */
const inMemory = (): SettingsService =>
  new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
const KNOWN = new Set(["winget", "npm-g"]);
const isKnown = (providerId: string): boolean => KNOWN.has(providerId);

describe("menuPreferencesSource", () => {
  it("serves the menu's defaults out of the box", () => {
    expect(menuPreferencesSource(inMemory(), isKnown).current()).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("follows the interface and scan sections, dropping providers this build lacks", () => {
    const settings = inMemory();
    const source = menuPreferencesSource(settings, isKnown);
    const heard = vi.fn();
    source.subscribe(heard);
    settings.update("interface", { packageSort: "bump", mouse: false });
    settings.update("scan", { fast: true, providerFilter: ["winget", "gone-provider"] });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(source.current()).toMatchObject({
      packageSort: "bump",
      scan: { fast: true, filter: ["winget"] },
    });
    expect(source.current()).not.toHaveProperty("mouse");
  });

  it("does not rebuild nor notify for a section the menu does not read", () => {
    const settings = inMemory();
    const source = menuPreferencesSource(settings, isKnown);
    const first = source.current();
    const heard = vi.fn();
    source.subscribe(heard);
    settings.update("theme", { id: "dark" });
    expect(heard).not.toHaveBeenCalled();
    expect(source.current()).toBe(first);
  });
});

describe("appearanceSource", () => {
  it("follows the theme, the symbol set and the density", () => {
    const settings = inMemory();
    const source = appearanceSource(settings);
    const heard = vi.fn();
    source.subscribe(heard);
    settings.update("theme", { id: "dracula" });
    settings.update("interface", { glyphs: "ascii", density: "compact" });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(source.current()).toEqual({
      theme: { id: "dracula", contrast: "AA", custom: {} },
      glyphs: "ascii",
      density: "compact",
    });
    settings.update("scan", { fast: true });
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
