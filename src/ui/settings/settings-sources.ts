import type { LogThreshold } from "../../core/log/log.js";
import type { UiPreferences, UiPreferencesSource } from "../app/ui-preferences.js";
import type { AppearanceSettings, AppearanceSource } from "../theme/runtime/themed-appearance.js";
import type { SettingsKey, SettingsService } from "./settings-service.js";

/**
 * The settings, as each consumer reads them: the menu its preferences, the
 * screens their appearance, the debug log its level. Each view is rebuilt
 * only when one of its sections changed (the menu asks on every frame).
 */

/** One reading of the settings: its value now, and a way to hear it change. */
export interface SettingView<T> {
  current(): T;
  subscribe(listener: () => void): () => void;
}

function cachedView<T>(
  settings: SettingsService,
  sections: readonly SettingsKey[],
  build: () => T,
): SettingView<T> {
  let value: T | null = null;
  settings.subscribe((key) => {
    if (sections.includes(key)) value = null;
  });
  return {
    current: () => (value ??= build()),
    subscribe: (listener) =>
      settings.subscribe((key) => {
        if (sections.includes(key)) listener();
      }),
  };
}

/**
 * The menu's preferences: the `interface` section's menu fields and the
 * `scan` section, minus filtered provider ids this build does not know.
 */
export function menuPreferencesSource(
  settings: SettingsService,
  isKnownProvider: (providerId: string) => boolean,
): UiPreferencesSource {
  return cachedView(settings, ["interface", "scan"], (): UiPreferences => {
    const { density: _density, glyphs: _glyphs, mouse: _mouse, ...menu } =
      settings.get("interface");
    const scan = settings.get("scan");
    return {
      ...menu,
      scan: { fast: scan.fast, filter: scan.providerFilter.filter(isKnownProvider) },
    };
  });
}

/** What the screens' appearance follows: the theme, the symbol set, the density. */
export function appearanceSource(settings: SettingsService): AppearanceSource {
  return cachedView(settings, ["theme", "interface"], (): AppearanceSettings => {
    const { glyphs, density } = settings.get("interface");
    return { theme: settings.get("theme"), glyphs, density };
  });
}

/** The debug log's level setting, which the log session follows while gup runs. */
export function logLevelSource(settings: SettingsService): SettingView<LogThreshold> {
  return cachedView(settings, ["log"], () => settings.get("log").level);
}
