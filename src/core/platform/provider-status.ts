import { ALL_PROVIDERS, detectAvailableProviders } from "../registry.js";
import type { Provider } from "../types.js";
import { isSupportedOn } from "./is-supported-on.js";
import type { ProviderStatusReport, ProviderSummary } from "./types.js";

type Group = "detected" | "missing" | "incompatible";

/**
 * Every registered provider, sorted into the three listing groups of the
 * running platform, in registry order within each group.
 *
 * Detection goes through detectAvailableProviders(), so it inherits its
 * concurrency cap and per-probe timeout: one wedged probe cannot hang a
 * listing. Incompatible providers are classified without any I/O.
 */
export async function readProviderStatus(): Promise<ProviderStatusReport> {
  const platform = process.platform;
  const detectedIds = new Set((await detectAvailableProviders()).map((p) => p.id));
  const groups: Record<Group, ProviderSummary[]> = { detected: [], missing: [], incompatible: [] };
  for (const provider of ALL_PROVIDERS) {
    groups[groupOf(provider, detectedIds, platform)].push(toSummary(provider));
  }
  return { platform, ...groups };
}

function groupOf(
  provider: Provider,
  detectedIds: ReadonlySet<string>,
  platform: NodeJS.Platform,
): Group {
  if (!isSupportedOn(provider, platform)) return "incompatible";
  return detectedIds.has(provider.id) ? "detected" : "missing";
}

function toSummary({ id, displayName, installHint, platforms }: Provider): ProviderSummary {
  return {
    id,
    displayName,
    ...(installHint !== undefined && { installHint }),
    ...(platforms !== undefined && { platforms }),
  };
}
