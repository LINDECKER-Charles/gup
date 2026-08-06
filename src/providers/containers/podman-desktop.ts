import { existsSync } from "node:fs";
import { win32 as winPath } from "node:path";
import { run } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Podman Desktop ships its own auto-updater (Electron `autoUpdater` against
 * the project's release feed). We scan and report, but defer the actual
 * upgrade to the GUI: the in-app updater is the only sanctioned path on
 * Windows and bypassing it leaves the squirrel/nupkg state inconsistent.
 */
export class PodmanDesktopProvider implements Provider {
  readonly id = "podman-desktop";
  readonly displayName = "Podman Desktop";
  // Détection basée sur les chemins Windows + VersionInfo : ailleurs le
  // provider ne remonte rien, même si l'application existe sur la plateforme.
  readonly installHint = pickInstallHint({
    win32: "winget install RedHat.Podman-Desktop",
    darwin: "brew install --cask podman-desktop (suivi gup : Windows uniquement)",
    fallback: "Suivi par gup sous Windows uniquement.",
  });

  async isAvailable(): Promise<boolean> {
    return podmanDesktopExe() !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const exe = podmanDesktopExe();
    if (!exe) return [];

    const current = await readFileProductVersion(exe);
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("containers/podman-desktop");
    if (!latest) return [];
    if (normalize(current) === normalize(latest)) return [];

    return [
      {
        id: "podman-desktop",
        name: "Podman Desktop",
        current,
        latest,
        note: "GUI updater",
        manual: true,
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return {
      id: "podman-desktop",
      success: false,
      skipped: true,
      message:
        "Lancer Podman Desktop → menu → Check for Updates pour appliquer.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("podman-desktop")];
  }
}

function podmanDesktopExe(): string | null {
  const local = process.env["LOCALAPPDATA"] ?? "";
  // `winPath.join` : ces chemins restent des chemins Windows quelle que soit
  // la machine qui exécute le code (les tests simulent win32 depuis POSIX).
  const candidates = [
    local && winPath.join(local, "Programs", "podman-desktop", "Podman Desktop.exe"),
    process.env["ProgramFiles"]
      ? winPath.join(process.env["ProgramFiles"]!, "Podman Desktop", "Podman Desktop.exe")
      : null,
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function readFileProductVersion(exePath: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const { stdout, failed } = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`,
  ]);
  if (failed) return null;
  const v = stdout.trim().split(/\s+/)[0];
  if (!v) return null;
  const m = v.match(/^v?(\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.-]+)?)/);
  return m?.[1] ?? null;
}

function normalize(v: string): string {
  return v.replace(/^v/i, "").trim().toLowerCase();
}
