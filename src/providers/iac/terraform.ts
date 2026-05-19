import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface TerraformVersionJson {
  terraform_version?: string;
  terraform_outdated?: boolean;
}

interface HashicorpReleaseJson {
  version?: string;
}

/**
 * Terraform has no self-update. `terraform version -json` includes an
 * `terraform_outdated` field but doesn't surface the latest version â€” we
 * use HashiCorp's releases API for that.
 */
export class TerraformProvider implements Provider {
  readonly id = "terraform";
  readonly displayName = "Terraform";
  readonly installHint = "winget install HashiCorp.Terraform";

  async isAvailable(): Promise<boolean> {
    return commandExists("terraform");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("terraform", ["version", "-json"]);
    if (failed) return [];

    let payload: TerraformVersionJson;
    try {
      payload = JSON.parse(stdout) as TerraformVersionJson;
    } catch {
      return [];
    }
    const current = payload.terraform_version;
    if (!current) return [];

    const latest = await fetchTerraformLatest();
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("terraform");
    return [
      {
        id: "terraform",
        name: "Terraform",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "terraform",
      binary: "terraform",
      packageIds: {
        scoop: "terraform",
        choco: "terraform",
        winget: "HashiCorp.Terraform",
      },
      manualMessage:
        "TÃ©lÃ©charger https://releases.hashicorp.com/terraform/ et remplacer terraform.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("terraform")];
  }
}

async function fetchTerraformLatest(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.releases.hashicorp.com/v1/releases/terraform/latest",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as HashicorpReleaseJson;
    return data.version ?? null;
  } catch {
    return null;
  }
}
