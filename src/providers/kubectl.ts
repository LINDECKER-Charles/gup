import { commandExists, run } from "../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

interface KubectlVersion {
  clientVersion?: { gitVersion?: string };
}

/**
 * kubectl: no self-update. Latest stable advertised at dl.k8s.io.
 */
export class KubectlProvider implements Provider {
  readonly id = "kubectl";
  readonly displayName = "kubectl";
  readonly installHint = "winget install Kubernetes.kubectl";

  async isAvailable(): Promise<boolean> {
    return commandExists("kubectl");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("kubectl", [
      "version",
      "--client",
      "-o",
      "json",
    ]);
    if (failed) return [];

    let payload: KubectlVersion;
    try {
      payload = JSON.parse(stdout) as KubectlVersion;
    } catch {
      return [];
    }
    const raw = payload.clientVersion?.gitVersion;
    if (!raw) return [];
    const current = raw.replace(/^v/, "");

    const latest = await fetchKubectlLatest();
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("kubectl");
    return [
      {
        id: "kubectl",
        name: "kubectl",
        current,
        latest,
        note: describeSource(source),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "kubectl",
      binary: "kubectl",
      packageIds: {
        scoop: "kubectl",
        choco: "kubernetes-cli",
        winget: "Kubernetes.kubectl",
      },
      manualMessage:
        "Télécharger kubectl depuis https://kubernetes.io/releases/download/",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("kubectl")];
  }
}

async function fetchKubectlLatest(): Promise<string | null> {
  try {
    const res = await fetch("https://dl.k8s.io/release/stable.txt", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.replace(/^v/, "");
  } catch {
    return null;
  }
}
