import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * PDM (Python Dependency Manager) self-update.
 * `pdm --version` prints "PDM, version 2.17.1".
 */
export class PdmProvider implements Provider {
  readonly id = "pdm";
  readonly displayName = "PDM";
  readonly installHint = "https://pdm-project.org/en/latest/#installation";

  async isAvailable(): Promise<boolean> {
    return commandExists("pdm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("pdm", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/PDM,?\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("pdm");
    if (!latest || latest === current) return [];

    return [{ id: "pdm", name: "PDM", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("pdm", ["self", "update"]);
    return { id: "pdm", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("pdm")];
  }
}

async function fetchPypiLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PypiJson;
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}
