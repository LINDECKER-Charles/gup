import type { OutdatedPackage, ProviderScanResult } from "../../../src/core/types.js";

/** One provider of the replayed scan, in the order it starts. */
export interface ScanStep {
  readonly providerId: string;
  /** How long its scan took, as the Scan view reports it. */
  readonly ms: number;
}

/** A scan of the fixture machine: what it finds, and how it unfolds. */
export interface ScanFixture {
  /** What each provider found; a step without a result found nothing. */
  readonly results: readonly ProviderScanResult[];
  /** Every provider the scan plans, in start order. */
  readonly steps: readonly ScanStep[];
  readonly elapsedMs: number;
}

function found(providerId: string, packages: readonly OutdatedPackage[]): ProviderScanResult {
  return { providerId, available: true, packages: [...packages] };
}

function bump(id: string, current: string, latest: string): OutdatedPackage {
  return { id, current, latest };
}

/**
 * A fictional but plausible Windows developer machine: real provider ids,
 * made-up versions, nothing taken from a real machine. Twelve outdated
 * packages in five providers, one provider whose scan fails, fourteen
 * providers scanned.
 */
export const SCAN_FIXTURE: ScanFixture = {
  results: [
    found("winget", [
      { ...bump("Git.Git", "2.51.0", "2.52.0"), name: "Git" },
      { ...bump("Microsoft.PowerToys", "0.94.1", "0.95.0"), name: "PowerToys" },
      { ...bump("7zip.7zip", "25.00", "25.01"), name: "7-Zip" },
      { ...bump("Microsoft.VisualStudioCode", "1.104.0", "1.105.1"), name: "Visual Studio Code" },
    ]),
    found("npm-g", [
      bump("typescript", "6.0.2", "6.0.3"),
      bump("pnpm", "10.17.0", "10.18.1"),
      bump("eslint", "10.9.0", "10.9.1"),
    ]),
    found("pipx", [bump("ruff", "0.13.0", "0.13.2"), bump("httpie", "3.2.3", "3.2.4")]),
    found("cargo", [bump("ripgrep", "14.1.1", "15.0.0"), bump("bat", "0.25.0", "0.26.0")]),
    found("choco", [
      { ...bump("nodejs-lts", "24.8.0", "24.9.0"), requiresAdmin: true, note: "admin" },
    ]),
    { providerId: "scoop", available: true, packages: [], error: "scoop status a échoué (code 1)" },
  ],
  steps: [
    { providerId: "winget", ms: 3100 },
    { providerId: "npm-g", ms: 1200 },
    { providerId: "pipx", ms: 2400 },
    { providerId: "cargo", ms: 1800 },
    { providerId: "choco", ms: 4000 },
    { providerId: "rustup", ms: 600 },
    { providerId: "helm", ms: 900 },
    { providerId: "gcloud", ms: 2200 },
    { providerId: "scoop", ms: 800 },
    { providerId: "vscode-ext", ms: 3600 },
    { providerId: "pwsh-modules", ms: 5900 },
    { providerId: "uv-tools", ms: 700 },
    { providerId: "gh-ext", ms: 1100 },
    { providerId: "dotnet-tools", ms: 1400 },
  ],
  elapsedMs: 6400,
};
