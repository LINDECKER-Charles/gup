import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface GitHubReleaseJson {
  tag_name?: string;
}

/**
 * Helm ships no self-update mechanism. We compare the installed binary
 * version against the latest GitHub release and delegate the update to the
 * package manager that owns the binary (scoop / choco / winget) â€” falling
 * back to a manual hint when none matches.
 */
export class HelmProvider implements Provider {
  readonly id = "helm";
  readonly displayName = "Helm";
  readonly installHint = "winget install Helm.Helm";

  async isAvailable(): Promise<boolean> {
    return commandExists("helm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("helm", ["version", "--short"]);
    if (failed) return [];

    // Format: "v3.15.4+g..."
    const m = stdout.trim().match(/^v?(\d[\w.+-]*?)(?:\+|$)/);
    const current = m?.[1];
    if (!current) return [];

    const latest = await fetchHelmLatest();
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("helm");
    return [
      {
        id: "helm",
        name: "Helm",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "helm",
      binary: "helm",
      packageIds: {
        scoop: "helm",
        choco: "kubernetes-helm",
        winget: "Helm.Helm",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/helm/helm/releases/latest et remplacer helm.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("helm")];
  }
}

async function fetchHelmLatest(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/helm/helm/releases/latest", {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubReleaseJson;
    return data.tag_name?.replace(/^v/, "") ?? null;
  } catch {
    return null;
  }
}
