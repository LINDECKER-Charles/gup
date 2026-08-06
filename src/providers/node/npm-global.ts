import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
}

/**
 * Uses `npm outdated -g --json` (built-in, no `npm-check-updates` dependency).
 * Falls back gracefully when no outdated packages (npm exits 1 with empty stdout).
 */
export class NpmGlobalProvider implements Provider {
  readonly id = "npm-g";
  readonly displayName = "npm (global)";
  readonly installHint = pickInstallHint({
    win32: "Installer Node.js: https://nodejs.org",
    fallback: "brew install node",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("npm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("npm", [
      "outdated",
      "-g",
      "--json",
      "--long",
    ]);
    if (!stdout.trim()) return [];

    let parsed: Record<string, NpmOutdatedEntry>;
    try {
      parsed = JSON.parse(stdout) as Record<string, NpmOutdatedEntry>;
    } catch {
      return [];
    }

    return Object.entries(parsed)
      .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
      .map<OutdatedPackage>(([name, info]) => ({
        id: name,
        name,
        current: info.current ?? "?",
        latest: info.latest ?? "?",
      }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("npm", ["install", "-g", `${packageId}@latest`]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const args = ["install", "-g", ...packages.map((p) => `${p.id}@latest`)];
    const res = await runInherit("npm", args);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
