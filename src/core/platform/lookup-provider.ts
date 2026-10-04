import { localized } from "../i18n/localized.js";
import { getProvider } from "../registry.js";
import type { PlatformSet } from "../types.js";
import { isSupportedOn } from "./is-supported-on.js";
import { platformName, supportLabel } from "./platform-label.js";
import type { ProviderLookup } from "./types.js";

const LOOKUP_LABELS = localized({
  en: {
    unknown: (id: string) => `Unknown provider: ${id}`,
    /** "Provider brew-cask unavailable on Windows (macOS only)". */
    unsupported: (id: string, here: string, support: string) =>
      `Provider ${id} unavailable on ${here} (${support})`,
  },
  fr: {
    unknown: (id) => `Provider inconnu: ${id}`,
    unsupported: (id, here, support) => `Provider ${id} indisponible sur ${here} (${support})`,
  },
});

/**
 * Resolve a provider id for an *action* (update, elevated batch, schedule).
 * Unknown and incompatible ids fail with a ready-to-print message in the
 * interface's language; callers decide whether that is an exit code or a
 * failed outcome.
 *
 * `getProvider()` keeps returning incompatible providers on purpose: display
 * names in history, reports and tables must still resolve. Only actions are
 * refused here, so a target file synced from another OS cannot drive a
 * same-named binary (a `brew.cmd` shim, the NCAR `ncl`) on this one.
 */
export function lookupProvider(id: string): ProviderLookup {
  const provider = getProvider(id);
  if (!provider) return { isFound: false, error: LOOKUP_LABELS.unknown(id) };
  if (isSupportedOn(provider)) return { isFound: true, provider };
  return { isFound: false, error: unsupportedProviderMessage(id, provider.platforms ?? []) };
}

function unsupportedProviderMessage(id: string, platforms: PlatformSet): string {
  return LOOKUP_LABELS.unsupported(id, platformName(process.platform), supportLabel(platforms));
}
