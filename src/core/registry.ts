import pLimit from "p-limit";
import { WingetProvider } from "../providers/winget.js";
import { NpmGlobalProvider } from "../providers/npm-global.js";
import { PnpmGlobalProvider } from "../providers/pnpm-global.js";
import { YarnGlobalProvider } from "../providers/yarn-global.js";
import { ScoopProvider } from "../providers/scoop.js";
import { ChocoProvider } from "../providers/choco.js";
import { PipProvider } from "../providers/pip.js";
import { PipxProvider } from "../providers/pipx.js";
import { DotnetToolsProvider } from "../providers/dotnet-tools.js";
import { CargoProvider } from "../providers/cargo.js";
import { PwshModulesProvider } from "../providers/pwsh-modules.js";
import { ComposerGlobalProvider } from "../providers/composer-global.js";
import { VsCodeExtProvider } from "../providers/vscode-ext.js";
import { SymfonyCliProvider } from "../providers/symfony-cli.js";
import { GhExtensionsProvider } from "../providers/gh-extensions.js";
import { JetBrainsProvider } from "../providers/jetbrains.js";
import { JetBrainsPluginsProvider } from "../providers/jetbrains-plugins.js";
import { AzProvider } from "../providers/az.js";
import { WslProvider } from "../providers/wsl.js";
import { PulumiProvider } from "../providers/pulumi.js";
import { TerraformProvider } from "../providers/terraform.js";
import { KubectlProvider } from "../providers/kubectl.js";
import { KrewProvider } from "../providers/krew.js";
import type { Provider, ProviderScanResult } from "./types.js";

/**
 * Single source of truth for the provider list. Order here drives display
 * order in `gup doctor` and the scan table. Group conceptually related
 * providers together for readability.
 */
export const ALL_PROVIDERS: Provider[] = [
  // OS-level / Windows
  new WingetProvider(),
  new ScoopProvider(),
  new ChocoProvider(),
  new WslProvider(),

  // Node.js / JS
  new NpmGlobalProvider(),
  new PnpmGlobalProvider(),
  new YarnGlobalProvider(),

  // Python
  new PipProvider(),
  new PipxProvider(),

  // .NET / PHP
  new DotnetToolsProvider(),
  new ComposerGlobalProvider(),
  new SymfonyCliProvider(),

  // Rust / PowerShell
  new CargoProvider(),
  new PwshModulesProvider(),

  // Cloud / IaC / K8s
  new AzProvider(),
  new TerraformProvider(),
  new PulumiProvider(),
  new KubectlProvider(),
  new KrewProvider(),

  // Dev tools / IDEs
  new GhExtensionsProvider(),
  new VsCodeExtProvider(),
  new JetBrainsProvider(),
  new JetBrainsPluginsProvider(),
];

export interface ScanOptions {
  /** Restrict to a subset of provider ids; empty = all available. */
  only?: string[];
  /** Skip providers self-flagged with `slow = true`. */
  fast?: boolean;
  /** Max parallel scans. Defaults to 4. */
  concurrency?: number;
  /** Fired when a provider's scan starts (for live progress UI). */
  onProviderStart?: (provider: Provider) => void;
  /** Fired when a provider's scan ends (success or failure). */
  onProviderEnd?: (provider: Provider, result: ProviderScanResult) => void;
}

export function getProvider(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export async function detectAvailableProviders(): Promise<Provider[]> {
  const checks = await Promise.all(
    ALL_PROVIDERS.map(async (p) => ({ p, ok: await p.isAvailable() })),
  );
  return checks.filter((c) => c.ok).map((c) => c.p);
}

/**
 * Returns the filtered list of providers that will be scanned, without
 * actually running the scans. Useful for UI that needs to know the total
 * upfront (e.g. progress counters).
 */
export async function getProvidersToScan(
  options: ScanOptions = {},
): Promise<Provider[]> {
  const available = await detectAvailableProviders();
  return available.filter((p) => {
    if (options.only?.length && !options.only.includes(p.id)) return false;
    if (options.fast && p.slow) return false;
    return true;
  });
}

export async function scanAll(options: ScanOptions = {}): Promise<ProviderScanResult[]> {
  const filtered = await getProvidersToScan(options);

  const limit = pLimit(options.concurrency ?? 4);
  return Promise.all(
    filtered.map((p) =>
      limit(async (): Promise<ProviderScanResult> => {
        options.onProviderStart?.(p);
        let result: ProviderScanResult;
        try {
          const packages = await p.listOutdated();
          result = { providerId: p.id, available: true, packages };
        } catch (err) {
          result = {
            providerId: p.id,
            available: true,
            packages: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
        options.onProviderEnd?.(p, result);
        return result;
      }),
    ),
  );
}
