import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchHashicorpLatest } from "../../core/hashicorp-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * HashiCorp Packer. Has a `packer version` command (line 1 = "Packer v1.x.y").
 */
export class PackerProvider implements Provider {
  readonly id = "packer";
  readonly displayName = "Packer";
  readonly installHint = "winget install HashiCorp.Packer";

  async isAvailable(): Promise<boolean> {
    return commandExists("packer");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("packer", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Packer\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchHashicorpLatest("packer");
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("packer");
    return [
      {
        id: "packer",
        name: "Packer",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "packer",
      binary: "packer",
      packageIds: {
        scoop: "packer",
        choco: "packer",
        winget: "HashiCorp.Packer",
      },
      manualMessage:
        "TÃ©lÃ©charger https://releases.hashicorp.com/packer/ et remplacer packer.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("packer")];
  }
}
