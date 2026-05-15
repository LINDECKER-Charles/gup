import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

interface AzVersionPayload {
  "azure-cli"?: string;
}

/**
 * Azure CLI has built-in self-update via `az upgrade --yes`.
 * Current version: `az version -o json`. Latest: PyPI metadata.
 */
export class AzProvider implements Provider {
  readonly id = "az";
  readonly displayName = "Azure CLI";
  readonly installHint = "winget install Microsoft.AzureCLI";

  async isAvailable(): Promise<boolean> {
    return commandExists("az");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("az", ["version", "-o", "json"]);
    if (failed || !stdout.trim()) return [];

    let payload: AzVersionPayload;
    try {
      payload = JSON.parse(stdout) as AzVersionPayload;
    } catch {
      return [];
    }
    const current = payload["azure-cli"];
    if (!current) return [];

    const latest = await fetchAzCliLatest();
    if (!latest || latest === current) return [];

    return [{ id: "az", name: "Azure CLI", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("az", ["upgrade", "--yes"]);
    return { id: "az", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("az")];
  }
}

async function fetchAzCliLatest(): Promise<string | null> {
  try {
    const res = await fetch("https://pypi.org/pypi/azure-cli/json", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { info?: { version?: string } };
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}
