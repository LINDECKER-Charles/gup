import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchHashicorpLatest } from "../../core/hashicorp-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * HashiCorp Packer. Has a `packer version` command (line 1 = "Packer v1.x.y").
 */
export class PackerProvider implements Provider {
  readonly id = "packer";
  readonly displayName = "Packer";
  // Les outils HashiCorp ont quitté homebrew-core : ils ne vivent plus que
  // dans le tap hashicorp/tap, d'où le `brew tap` explicite dans le hint.
  readonly installHint = pickInstallHint({
    win32: "winget install HashiCorp.Packer",
    fallback: "brew tap hashicorp/tap && brew install packer",
  });

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
        // Formule du tap hashicorp/tap : une fois installée, le nom court
        // suffit à `brew upgrade`.
        brew: "packer",
      },
      manualMessage:
        "Télécharger https://releases.hashicorp.com/packer/ et remplacer packer.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("packer")];
  }
}
