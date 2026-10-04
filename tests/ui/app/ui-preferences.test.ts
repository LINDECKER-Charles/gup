import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_PREFERENCES,
  setUiPreferencesSource,
  uiPreferences,
} from "../../../src/ui/app/ui-preferences.js";

afterEach(() => {
  setUiPreferencesSource(null);
});

describe("menu preferences", () => {
  it("default to gup's behaviour, updated packages dropped rather than rescanned", () => {
    expect(uiPreferences().current()).toBe(DEFAULT_UI_PREFERENCES);
    expect(DEFAULT_UI_PREFERENCES).toMatchObject({
      launchView: "scan",
      scanOnLaunch: true,
      confirmBeforeUpdate: true,
      rescanAfterUpdate: false,
      animations: true,
    });
  });

  it("come from the source a module installed, until it is removed", () => {
    const custom = { ...DEFAULT_UI_PREFERENCES, animations: false };
    const subscribe = vi.fn(() => () => {});
    setUiPreferencesSource({ current: () => custom, subscribe });
    expect(uiPreferences().current().animations).toBe(false);
    uiPreferences().subscribe(() => {});
    expect(subscribe).toHaveBeenCalledOnce();
    setUiPreferencesSource(null);
    expect(uiPreferences().current()).toBe(DEFAULT_UI_PREFERENCES);
  });
});
