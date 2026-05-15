import { commandExists, run } from "../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * Symfony CLI is a single binary and no longer ships a `self:update` command.
 * Updates are delegated to whichever package manager installed it.
 */
export class SymfonyCliProvider implements Provider {
  readonly id = "symfony-cli";
  readonly displayName = "Symfony CLI";
  readonly installHint = "https://symfony.com/download";

  async isAvailable(): Promise<boolean> {
    return commandExists("symfony");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("symfony", ["version", "--no-ansi"]);
    const match = stdout.match(
      /version\s+v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/i,
    );
    if (!match?.[1]) return [];
    const current = match[1];

    const latest = await fetchSymfonyCliLatest();
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("symfony");
    return [
      {
        id: "symfony-cli",
        name: "Symfony CLI",
        current,
        latest: normLatest,
        note: describeSource(source),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "symfony-cli",
      binary: "symfony",
      packageIds: {
        scoop: "symfony-cli",
        choco: "symfony-cli",
        winget: "SensioLabs.Symfony-Cli",
      },
      manualMessage:
        "Télécharger https://github.com/symfony-cli/symfony-cli/releases et remplacer symfony.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("symfony-cli")];
  }
}

async function fetchSymfonyCliLatest(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/symfony-cli/symfony-cli/releases/latest",
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
