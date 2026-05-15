import pLimit from "p-limit";
import { WingetProvider } from "../providers/winget.js";
import { NpmGlobalProvider } from "../providers/npm-global.js";
import { PnpmGlobalProvider } from "../providers/pnpm-global.js";
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
import type { Provider, ProviderScanResult } from "./types.js";

export const ALL_PROVIDERS: Provider[] = [
  new WingetProvider(),
  new NpmGlobalProvider(),
  new PnpmGlobalProvider(),
  new ScoopProvider(),
  new ChocoProvider(),
  new PipProvider(),
  new PipxProvider(),
  new DotnetToolsProvider(),
  new CargoProvider(),
  new PwshModulesProvider(),
  new ComposerGlobalProvider(),
  new VsCodeExtProvider(),
  new SymfonyCliProvider(),
  new GhExtensionsProvider(),
  new JetBrainsProvider(),
];

export interface ScanOptions {
  /** Restrict to a subset of provider ids; empty = all available. */
  only?: string[];
  /** Skip slow providers (currently: pwsh-modules, vscode-ext). */
  fast?: boolean;
  /** Max parallel scans. Defaults to 4. */
  concurrency?: number;
}

const SLOW_PROVIDERS = new Set([
  "pwsh-modules",
  "vscode-ext",
  "gh-ext",
  "jetbrains",
]);

export function getProvider(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export async function detectAvailableProviders(): Promise<Provider[]> {
  const checks = await Promise.all(
    ALL_PROVIDERS.map(async (p) => ({ p, ok: await p.isAvailable() })),
  );
  return checks.filter((c) => c.ok).map((c) => c.p);
}

export async function scanAll(options: ScanOptions = {}): Promise<ProviderScanResult[]> {
  const available = await detectAvailableProviders();
  const filtered = available.filter((p) => {
    if (options.only?.length && !options.only.includes(p.id)) return false;
    if (options.fast && SLOW_PROVIDERS.has(p.id)) return false;
    return true;
  });

  const limit = pLimit(options.concurrency ?? 4);
  return Promise.all(
    filtered.map((p) =>
      limit(async (): Promise<ProviderScanResult> => {
        try {
          const packages = await p.listOutdated();
          return { providerId: p.id, available: true, packages };
        } catch (err) {
          return {
            providerId: p.id,
            available: true,
            packages: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    ),
  );
}
