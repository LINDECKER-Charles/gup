import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchHashicorpLatest } from "../../core/hashicorp-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * HashiCorp Vault. No self-update.
 * Version output: "Vault v1.16.3 (...)"
 */
export class VaultProvider implements Provider {
  readonly id = "vault";
  readonly displayName = "Vault";
  readonly installHint = "winget install HashiCorp.Vault";

  async isAvailable(): Promise<boolean> {
    return commandExists("vault");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("vault", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Vault\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchHashicorpLatest("vault");
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("vault");
    return [
      {
        id: "vault",
        name: "Vault",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "vault",
      binary: "vault",
      packageIds: {
        scoop: "vault",
        choco: "vault",
        winget: "HashiCorp.Vault",
      },
      manualMessage:
        "TÃ©lÃ©charger https://releases.hashicorp.com/vault/ et remplacer vault.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("vault")];
  }
}
