import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface ComposerOutdated {
  installed?: Array<{
    name: string;
    version: string;
    latest: string;
    "latest-status"?: string;
  }>;
}

export class ComposerGlobalProvider implements Provider {
  readonly id = "composer-g";
  readonly displayName = "Composer (global)";
  readonly installHint = pickInstallHint({
    win32: "https://getcomposer.org/download/",
    fallback: "brew install composer",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("composer");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("composer", [
      "global",
      "outdated",
      "-D",
      "--format=json",
      "--no-interaction",
    ]);
    if (!stdout.trim()) return [];

    let parsed: ComposerOutdated;
    try {
      parsed = JSON.parse(stdout) as ComposerOutdated;
    } catch {
      return [];
    }
    return (parsed.installed ?? [])
      .filter((p) => p.version !== p.latest)
      .map<OutdatedPackage>((p) => ({
        id: p.name,
        name: p.name,
        current: p.version,
        latest: p.latest,
        ...(p["latest-status"] && { note: p["latest-status"] }),
      }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("composer", ["global", "update", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("composer", ["global", "update"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
