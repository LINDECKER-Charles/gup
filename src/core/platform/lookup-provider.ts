import { getProvider } from "../registry.js";
import type { PlatformSet } from "../types.js";
import { isSupportedOn } from "./is-supported-on.js";
import { platformName, supportLabel } from "./platform-label.js";
import type { ProviderLookup } from "./types.js";

/**
 * Resolve a provider id for an *action* (update, elevated batch, schedule).
 * Unknown and incompatible ids fail with a ready-to-print French message;
 * callers decide whether that is an exit code or a failed outcome.
 *
 * `getProvider()` keeps returning incompatible providers on purpose: display
 * names in history, reports and tables must still resolve. Only actions are
 * refused here, so a target file synced from another OS cannot drive a
 * same-named binary (a `brew.cmd` shim, the NCAR `ncl`) on this one.
 */
export function lookupProvider(id: string): ProviderLookup {
  const provider = getProvider(id);
  if (!provider) return { isFound: false, error: unknownProviderMessage(id) };
  if (isSupportedOn(provider)) return { isFound: true, provider };
  return { isFound: false, error: unsupportedProviderMessage(id, provider.platforms ?? []) };
}

function unknownProviderMessage(id: string): string {
  return `Provider inconnu: ${id}`;
}

/** "Provider brew-cask indisponible sur Windows (macOS uniquement)". */
function unsupportedProviderMessage(id: string, platforms: PlatformSet): string {
  const here = platformName(process.platform);
  return `Provider ${id} indisponible sur ${here} (${supportLabel(platforms)})`;
}
