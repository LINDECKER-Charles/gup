import { existsSync } from "node:fs";
import { win32 as winPath } from "node:path";
import { run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface GitHubReleaseJson {
  tag_name?: string;
  name?: string;
}

/**
 * Docker Desktop ships its own in-app updater and an MSI installer with a
 * code-signed daemon that requires admin elevation. `gup` can't reliably
 * trigger that updater without admin + GUI interaction, so the provider is
 * scan-only: detect the installed version, compare to the latest release
 * tagged in docker/for-win, and surface the result as a manual action.
 */
export class DockerDesktopProvider implements Provider {
  readonly id = "docker-desktop";
  readonly displayName = "Docker Desktop";
  // La détection repose sur les chemins d'installation Windows et sur
  // VersionInfo (PowerShell) : le provider ne remonte donc rien ailleurs, même
  // là où Docker Desktop existe bel et bien.
  readonly installHint = pickInstallHint({
    win32: "winget install Docker.DockerDesktop",
    darwin: "brew install --cask docker-desktop (suivi gup : Windows uniquement)",
    fallback: "Suivi par gup sous Windows uniquement.",
  });

  async isAvailable(): Promise<boolean> {
    return dockerDesktopExe() !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const exe = dockerDesktopExe();
    if (!exe) return [];

    const current = await readFileProductVersion(exe);
    if (!current) return [];

    const latest = await fetchDockerDesktopLatest();
    if (!latest || latest === current) return [];

    return [
      {
        id: "docker-desktop",
        name: "Docker Desktop",
        current,
        latest,
        note: "GUI updater",
        manual: true,
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return {
      id: "docker-desktop",
      success: false,
      skipped: true,
      message:
        "Ouvrir Docker Desktop → Settings → Software Updates pour appliquer.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("docker-desktop")];
  }
}

function dockerDesktopExe(): string | null {
  // `winPath.join` plutôt que `join` : ces chemins sont des chemins Windows
  // quelle que soit la machine qui exécute le code, et les tests simulent
  // win32 depuis un hôte POSIX où `join` produirait des slashes.
  const candidates = [
    process.env["ProgramFiles"]
      ? winPath.join(
          process.env["ProgramFiles"]!,
          "Docker",
          "Docker",
          "Docker Desktop.exe",
        )
      : null,
    process.env["ProgramFiles(x86)"]
      ? winPath.join(
          process.env["ProgramFiles(x86)"]!,
          "Docker",
          "Docker",
          "Docker Desktop.exe",
        )
      : null,
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function readFileProductVersion(exePath: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  // Pass the path via an env var rather than interpolating into the script
  // body. Avoids any quoting concerns and gives CodeQL a clean signal that the
  // command line is not built from tainted input (re: alert #12,
  // js/indirect-command-line-injection).
  const { stdout, failed } = await run(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; (Get-Item -LiteralPath $env:GUP_DOCKER_DESKTOP_EXE).VersionInfo.ProductVersion",
    ],
    { env: { ...process.env, GUP_DOCKER_DESKTOP_EXE: exePath } },
  );
  if (failed) return null;
  const v = stdout.trim().split(/\s+/)[0];
  if (!v) return null;
  // Docker Desktop file version is "4.34.2.167585" — only the first three
  // components match what the release feed exposes.
  const m = v.match(/^v?(\d+(?:\.\d+){1,2})/);
  return m?.[1] ?? null;
}

async function fetchDockerDesktopLatest(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/docker/for-win/releases/latest",
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubReleaseJson;
    const raw = data.tag_name ?? data.name ?? null;
    if (!raw) return null;
    const m = raw.match(/v?(\d+(?:\.\d+){1,2})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
