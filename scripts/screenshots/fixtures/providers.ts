import { isSupportedOn } from "../../../src/core/platform/is-supported-on.js";
import type { ProviderStatusReport, ProviderSummary } from "../../../src/core/platform/types.js";
import { ALL_PROVIDERS } from "../../../src/core/registry.js";
import type { Provider } from "../../../src/core/types.js";
import { FIXTURE_PLATFORM } from "./machine.js";
import { registeredProvider } from "./registered-provider.js";
import { SCAN_FIXTURE } from "./scan.js";

type Group = "detected" | "missing" | "incompatible";

/**
 * Providers the fixture machine lacks, with the Windows install command the
 * Providers view suggests. Fixed here: a provider's own hint depends on the
 * OS that renders the screenshot.
 */
const MISSING_HINTS: Readonly<Record<string, string>> = {
  "pnpm-g": "npm install -g pnpm",
  deno: "winget install DenoLand.Deno",
  volta: "winget install Volta.Volta",
  poetry: "pipx install poetry",
  kubectl: "winget install Kubernetes.kubectl",
};

/** The fixture machine has what its scan scans. */
const DETECTED_IDS: ReadonlySet<string> = new Set(
  SCAN_FIXTURE.steps.map((step) => step.providerId),
);

/** Where `readProviderStatus()` would list `provider`; null when the fixture leaves it out. */
function groupOf(provider: Provider): Group | null {
  if (!isSupportedOn(provider, FIXTURE_PLATFORM)) return "incompatible";
  if (DETECTED_IDS.has(provider.id)) return "detected";
  return Object.hasOwn(MISSING_HINTS, provider.id) ? "missing" : null;
}

function summaryOf({ id, displayName, platforms }: Provider): ProviderSummary {
  const installHint = MISSING_HINTS[id];
  return {
    id,
    displayName,
    ...(installHint !== undefined && { installHint }),
    ...(platforms !== undefined && { platforms }),
  };
}

function providerStatus(): ProviderStatusReport {
  // An id the registry no longer has fails the run instead of vanishing from the screenshot.
  for (const id of [...DETECTED_IDS, ...Object.keys(MISSING_HINTS)]) registeredProvider(id);
  const groups: Record<Group, ProviderSummary[]> = { detected: [], missing: [], incompatible: [] };
  for (const provider of ALL_PROVIDERS) {
    const group = groupOf(provider);
    if (group) groups[group].push(summaryOf(provider));
  }
  return { platform: FIXTURE_PLATFORM, ...groups };
}

/**
 * The fixture machine's providers, grouped as `readProviderStatus()` groups
 * them (registry order inside each group): the scanned ones detected, five
 * missing, and every provider foreign to Windows incompatible — read from
 * the registry, so the screenshot follows the providers' declared platforms.
 */
export const PROVIDERS_FIXTURE: ProviderStatusReport = providerStatus();
