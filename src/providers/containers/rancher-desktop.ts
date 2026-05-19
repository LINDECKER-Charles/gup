import { existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Rancher Desktop. Electron app with built-in updater. Same policy as the
 * other desktop providers: report only, route the user to the GUI.
 */
export class RancherDesktopProvider implements Provider {
  readonly id = "rancher-desktop";
  readonly displayName = "Rancher Desktop";
  readonly installHint = "winget install SUSE.RancherDesktop";

  async isAvailable(): Promise<boolean> {
    return rancherDesktopExe() !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const exe = rancherDesktopExe();
    if (!exe) return [];

    const current = await readFileProductVersion(exe);
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("rancher-sandbox/rancher-desktop");
    if (!latest) return [];
    if (normalize(current) === normalize(latest)) return [];

    return [
      {
        id: "rancher-desktop",
        name: "Rancher Desktop",
        current,
        latest,
        note: "GUI updater",
        manual: true,
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return {
      id: "rancher-desktop",
      success: false,
      skipped: true,
      message:
        "Lancer Rancher Desktop â†’ Preferences â†’ Check for Updates pour appliquer.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("rancher-desktop")];
  }
}

function rancherDesktopExe(): string | null {
  const local = process.env["LOCALAPPDATA"] ?? "";
  const candidates = [
    local && join(local, "Programs", "Rancher Desktop", "Rancher Desktop.exe"),
    process.env["ProgramFiles"]
      ? join(process.env["ProgramFiles"]!, "Rancher Desktop", "Rancher Desktop.exe")
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
