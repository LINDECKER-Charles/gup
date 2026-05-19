import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchHashicorpLatest } from "../../core/hashicorp-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * HashiCorp Nomad. No self-update.
 * Version output: "Nomad v1.7.6\nBuildDate ..."
 */
export class NomadProvider implements Provider {
  readonly id = "nomad";
  readonly displayName = "Nomad";
  readonly installHint = "winget install HashiCorp.Nomad";

  async isAvailable(): Promise<boolean> {
    return commandExists("nomad");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("nomad", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Nomad\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchHashicorpLatest("nomad");
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("nomad");
    return [
      {
        id: "nomad",
        name: "Nomad",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "nomad",
      binary: "nomad",
      packageIds: {
        scoop: "nomad",
        choco: "nomad",
        winget: "HashiCorp.Nomad",
      },
      manualMessage:
        "TÃ©lÃ©charger https://releases.hashicorp.com/nomad/ et remplacer nomad.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("nomad")];
  }
}
