import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PwshModuleRow {
  Name: string;
  CurrentVersion: string;
  LatestVersion: string;
}

const SCAN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$installed = Get-InstalledModule
$results = foreach ($m in $installed) {
  $latest = Find-Module -Name $m.Name -ErrorAction SilentlyContinue
  if ($latest -and $latest.Version -gt $m.Version) {
    [pscustomobject]@{
      Name = $m.Name
      CurrentVersion = "$($m.Version)"
      LatestVersion = "$($latest.Version)"
    }
  }
}
$results | ConvertTo-Json -Compress -Depth 3
`;

/**
 * Uses pwsh (cross-platform) if available, else falls back to powershell.exe.
 * Querying PSGallery for every module is slow — provider sits behind the
 * generic parallel scan and the user can opt out by filtering providers.
 */
export class PwshModulesProvider implements Provider {
  readonly id = "pwsh-modules";
  readonly displayName = "PowerShell modules";
  readonly installHint = pickInstallHint({
    win32: "PowerShell 7+: `winget install Microsoft.PowerShell`",
    fallback: "PowerShell 7+: `brew install powershell`",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return (await commandExists("pwsh")) || (await commandExists("powershell"));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const shell = (await commandExists("pwsh")) ? "pwsh" : "powershell";
    const { stdout } = await run(shell, [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      SCAN_SCRIPT,
    ]);
    if (!stdout.trim()) return [];

    let parsed: PwshModuleRow | PwshModuleRow[];
    try {
      parsed = JSON.parse(stdout) as PwshModuleRow | PwshModuleRow[];
    } catch {
      return [];
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map<OutdatedPackage>((r) => ({
      id: r.Name,
      name: r.Name,
      current: r.CurrentVersion,
      latest: r.LatestVersion,
    }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const shell = (await commandExists("pwsh")) ? "pwsh" : "powershell";
    const res = await runInherit(shell, [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Update-Module -Name '${packageId.replace(/'/g, "''")}' -Force -AcceptLicense`,
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}
