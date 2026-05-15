import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * Symfony CLI is a single binary and no longer ships a `self:update` command —
 * upstream defers updates to whichever package manager installed it.
 *
 * Strategy:
 *  - Scan: read `symfony version`, compare to latest GitHub release.
 *  - Update: locate the binary, infer its install source from the path,
 *    delegate to the matching PM (scoop / choco / winget). Fall back to a
 *    `skipped` outcome with a download URL when the binary is standalone.
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

    const source = await detectInstallSource();
    return [
      {
        id: "symfony-cli",
        name: "Symfony CLI",
        current,
        latest: normLatest,
        note: noteForSource(source),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const source = await detectInstallSource();
    switch (source) {
      case "scoop": {
        const res = await runInherit("scoop", ["update", "symfony-cli"]);
        return { id: "symfony-cli", success: !res.failed };
      }
      case "choco": {
        const res = await runInherit("choco", ["upgrade", "symfony-cli", "-y"]);
        return { id: "symfony-cli", success: !res.failed };
      }
      case "winget": {
        const res = await runInherit("winget", [
          "upgrade",
          "--id",
          "SensioLabs.Symfony-Cli",
          "--silent",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ]);
        return { id: "symfony-cli", success: !res.failed };
      }
      case "manual":
      default:
        return {
          id: "symfony-cli",
          success: false,
          skipped: true,
          message:
            "Installation manuelle — télécharger https://github.com/symfony-cli/symfony-cli/releases et remplacer symfony.exe",
        };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("symfony-cli")];
  }
}

type InstallSource = "scoop" | "choco" | "winget" | "manual";

async function detectInstallSource(): Promise<InstallSource> {
  const probe = process.platform === "win32" ? "where" : "which";
  const { stdout, failed } = await run(probe, ["symfony"]);
  if (failed) return "manual";

  const firstLine = stdout.split(/\r?\n/)[0]?.trim().toLowerCase() ?? "";
  if (!firstLine) return "manual";
  if (firstLine.includes("\\scoop\\")) return "scoop";
  if (firstLine.includes("chocolatey")) return "choco";
  if (firstLine.includes("\\winget\\") || firstLine.includes("\\packages\\sensiolabs"))
    return "winget";
  return "manual";
}

function noteForSource(source: InstallSource): string {
  switch (source) {
    case "scoop":
      return "via scoop";
    case "choco":
      return "via choco";
    case "winget":
      return "via winget";
    case "manual":
      return "manuel — github releases";
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
