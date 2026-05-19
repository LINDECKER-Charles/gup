import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * DigitalOcean CLI. `doctl version` prints "doctl version 1.110.0-release".
 */
export class DoctlProvider implements Provider {
  readonly id = "doctl";
  readonly displayName = "DigitalOcean CLI";
  readonly installHint = "winget install DigitalOcean.Doctl";

  async isAvailable(): Promise<boolean> {
    return commandExists("doctl");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("doctl", ["version"]);
    if (failed) return [];

    const match = stdout.match(/doctl\s+version\s+v?([0-9][\w.+-]*?)(?:-release|\s|$)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("digitalocean/doctl");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("doctl");
    return [
      {
        id: "doctl",
        name: "doctl",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "doctl",
      binary: "doctl",
      packageIds: {
        scoop: "doctl",
        choco: "doctl",
        winget: "DigitalOcean.Doctl",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/digitalocean/doctl/releases et remplacer doctl.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("doctl")];
  }
}
