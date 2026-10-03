import { defineSection } from "./section.js";

/**
 * The `scan` section: how the interactive menu scans. `gup list` and
 * `gup update` keep their explicit flags, so a script never changes
 * behaviour because of a setting it cannot see.
 */

export interface ScanSettings {
  /** Skip the slow providers. */
  readonly fast: boolean;
  /** Scan only these providers; empty: all of them. */
  readonly providerFilter: readonly string[];
}

/**
 * A provider id as the registry writes them (`npm-g`, `R-packages`). The
 * parser stays registry-agnostic: ids unknown to this build are dropped when
 * the menu reads them, not here (a newer gup may know them).
 */
export const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,47}$/;
/** Far above the registry's size: a longer list is not a hand-made filter. */
const MAX_FILTERED_PROVIDERS = 200;

const DEFAULTS: ScanSettings = Object.freeze({ fast: false, providerFilter: Object.freeze([]) });

export const SCAN_SECTION = defineSection<ScanSettings>({
  key: "scan",
  version: 1,
  defaults: DEFAULTS,
  parse: (read) => ({
    fast: read.boolean("fast", DEFAULTS.fast),
    providerFilter: read.ids("providerFilter", {
      max: MAX_FILTERED_PROVIDERS,
      pattern: PROVIDER_ID_PATTERN,
    }),
  }),
});
