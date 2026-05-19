import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PnpmOutdatedEntry {
  current: string;
  wanted: string;
  latest: string;
  isDeprecated?: boolean;
  dependencyType?: string;
}

/**
 * pnpm has native JSON output for outdated. We use `add -g <pkg>@latest`
 * (not `update -g`) so cross-major upgrades are applied â€” `update` is
 * semver-respecting and would skip majors.
 */
export class PnpmGlobalProvider implements Provider {
  readonly id = "pnpm-g";
  readonly displayName = "pnpm (global)";
  readonly installHint = "winget install pnpm.pnpm";

  async isAvailable(): Promise<boolean> {
    return commandExists("pnpm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("pnpm", [
      "outdated",
      "--global",
      "--format",
      "json",
    ]);
    if (!stdout.trim()) return [];

    let parsed: Record<string, PnpmOutdatedEntry>;
    try {
      parsed = JSON.parse(stdout) as Record<string, PnpmOutdatedEntry>;
    } catch {
      return [];
    }

    return Object.entries(parsed)
      .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
      .map<OutdatedPackage>(([name, info]) => ({
        id: name,
        name,
        current: info.current,
        latest: info.latest,
        ...(info.isDeprecated && { note: "deprecated" }),
      }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("pnpm", ["add", "-g", `${packageId}@latest`]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("pnpm", [
      "add",
      "-g",
      ...packages.map((p) => `${p.id}@latest`),
    ]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
