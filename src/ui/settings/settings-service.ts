import { INSTALL_SECTION, type InstallSettings } from "../../core/config/install-section.js";
import { SCAN_SECTION, type ScanSettings } from "../../core/config/scan-section.js";
import type { ConfigSectionDef } from "../../core/config/section.js";
import { configStore, type ConfigStatus, type ConfigStore } from "../../core/config/store.js";
import { INTERFACE_SECTION, type InterfaceSettings } from "./interface-section.js";
import { THEME_SECTION, type ThemeSettings } from "./theme-section.js";

/**
 * The settings the interactive app shows and edits, as one typed façade over
 * the settings store: read a section, change some of its fields, reset
 * sections, hear about changes. Persistence failures surface as the store's
 * `ConfigWriteError`; the new value stays in effect for the session anyway.
 */

export interface SettingsMap {
  theme: ThemeSettings;
  interface: InterfaceSettings;
  scan: ScanSettings;
  install: InstallSettings;
}
export type SettingsKey = keyof SettingsMap;

const SECTIONS: { readonly [K in SettingsKey]: ConfigSectionDef<SettingsMap[K]> } = {
  theme: THEME_SECTION,
  interface: INTERFACE_SECTION,
  scan: SCAN_SECTION,
  install: INSTALL_SECTION,
};
const KEYS = Object.keys(SECTIONS) as SettingsKey[];

function isSettingsKey(key: string): key is SettingsKey {
  return (KEYS as readonly string[]).includes(key);
}

export class SettingsService {
  readonly #store: ConfigStore;

  constructor(store: ConfigStore) {
    this.#store = store;
  }

  get<K extends SettingsKey>(key: K): SettingsMap[K] {
    return this.#store.read(SECTIONS[key]);
  }

  /** Merge `patch` into the section, keep it in effect, persist it (may throw ConfigWriteError). */
  update<K extends SettingsKey>(key: K, patch: Partial<SettingsMap[K]>): void {
    this.#store.write(SECTIONS[key], { ...this.get(key), ...patch });
  }

  /**
   * Back to the defaults, for every key even when one cannot be persisted;
   * the first failure is rethrown once all are reset in memory.
   */
  reset(keys: readonly SettingsKey[]): void {
    let failure: unknown = null;
    for (const key of keys) {
      try {
        this.#store.reset(SECTIONS[key]);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure !== null) throw failure;
  }

  /** The file's state, with the issues of every section this service knows. */
  status(): ConfigStatus {
    for (const key of KEYS) this.get(key);
    return this.#store.status();
  }

  /** `listener(key)` after any change to one of these sections. Returns the unsubscribe. */
  subscribe(listener: (key: SettingsKey) => void): () => void {
    return this.#store.subscribe((sectionKey) => {
      if (isSettingsKey(sectionKey)) listener(sectionKey);
    });
  }
}

let processService: SettingsService | null = null;

/** The process-wide service over the process-wide settings store. */
export function settingsService(): SettingsService {
  processService ??= new SettingsService(configStore());
  return processService;
}
