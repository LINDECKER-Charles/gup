import { commandExists, run } from "../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * Pulumi has no `self-update`. The CLI's own `pulumi update` operates on
 * stacks, not the binary. We delegate to the source PM.
 */
export class PulumiProvider implements Provider {
  readonly id = "pulumi";
  readonly displayName = "Pulumi";
  readonly installHint = "https://www.pulumi.com/docs/install/";

  async isAvailable(): Promise<boolean> {
    return commandExists("pulumi");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("pulumi", ["version"]);
    if (failed) return [];
    const current = stdout.trim().replace(/^v/, "");
    if (!current) return [];

    const latest = await fetchPulumiLatest();
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("pulumi");
    return [
      {
        id: "pulumi",
        name: "Pulumi",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "pulumi",
      binary: "pulumi",
      packageIds: {
        scoop: "pulumi",
        choco: "pulumi",
        winget: "Pulumi.Pulumi",
      },
      manualMessage:
        "Réinstaller via https://www.pulumi.com/docs/install/ (le script télécharge la dernière version).",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("pulumi")];
  }
}

async function fetchPulumiLatest(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/pulumi/pulumi/releases/latest",
      {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
}
