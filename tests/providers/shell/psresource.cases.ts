import type { OutdatedPackage } from "../../../src/core/types.js";
import { PsResourceProvider } from "../../../src/providers/shell/psresource.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import type { CommandAnswer, SystemSpec } from "../../support/system/types.js";
import { type PowerShell, powerShellHost } from "./shell.cases.js";

/**
 * PSResourceGet, the v3 PowerShell package manager: a probe for its cmdlet,
 * then one PowerShell scan (installed resources against the gallery), both
 * run by pwsh or, failing that, Windows PowerShell. The scripts are pinned
 * verbatim: the argv is what reaches the shell.
 */

const HOST_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

const PROBE_SCRIPT =
  "if (Get-Command Get-InstalledPSResource -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }";

export const SCAN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$highest = @{}
foreach ($r in Get-InstalledPSResource) {
  if (-not $r.Name) { continue }
  $kept = $highest[$r.Name]
  if ($null -eq $kept) { $highest[$r.Name] = $r; continue }
  if ($r.Version -gt $kept.Version) { $highest[$r.Name] = $r; continue }
  if ($r.Version -eq $kept.Version -and -not $r.Prerelease) { $highest[$r.Name] = $r }
}
$results = foreach ($r in $highest.Values) {
  $latest = Find-PSResource -Name $r.Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($latest -and $latest.Version -gt $r.Version) {
    $current = if ($r.Prerelease) { "$($r.Version)-$($r.Prerelease)" } else { "$($r.Version)" }
    [pscustomobject]@{
      Name = $r.Name
      CurrentVersion = $current
      LatestVersion = "$($latest.Version)"
      Type = "$($r.Type)"
    }
  }
}
$results | ConvertTo-Json -Compress -Depth 3
`;

export function probeArgv(shell: PowerShell): string[] {
  return [shell, ...HOST_ARGS, PROBE_SCRIPT];
}

export function scanArgv(shell: PowerShell): string[] {
  return [shell, ...HOST_ARGS, SCAN_SCRIPT];
}

/** `Update-PSResource` of one resource into the user scope, its name already quoted. */
export function updateResourceArgv(shell: PowerShell, quotedName: string): string[] {
  const script =
    `Update-PSResource -Name '${quotedName}' -Scope CurrentUser -TrustRepository ` +
    "-AcceptLicense -Confirm:$false";
  return [shell, ...HOST_ARGS, script];
}

/** One row of the scan's JSON. */
export function psRow(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    Name: "Microsoft.PowerShell.SecretManagement",
    CurrentVersion: "1.1.2",
    LatestVersion: "1.2.0",
    Type: "Module",
    ...overrides,
  };
}

interface PsResourceMachine {
  readonly shell: PowerShell;
  /** What the cmdlet probe answers; PSResourceGet is there by default. */
  readonly probe?: CommandAnswer;
  readonly scan?: CommandAnswer;
}

/** `shell` alone on PATH, its PSResourceGet probe and scan answering as given. */
export function psResourceMachine(machine: PsResourceMachine): SystemSpec {
  const { shell } = machine;
  return {
    ...powerShellHost(shell),
    commands: [
      { argv: probeArgv(shell), ...(machine.probe ?? { stdout: "yes\n" }) },
      { argv: scanArgv(shell), ...(machine.scan ?? { stdout: "null" }) },
    ],
  };
}

const SECRET_MANAGEMENT: OutdatedPackage = {
  id: "Microsoft.PowerShell.SecretManagement",
  name: "Microsoft.PowerShell.SecretManagement",
  current: "1.1.2",
  latest: "1.2.0",
};

/** PowerShell 7: a module and a script, the script noted as such (pwsh-modules cannot see it). */
const PWSH: ProviderContractCase = {
  scenario: "pwsh",
  create: () => new PsResourceProvider(),
  system: psResourceMachine({
    shell: "pwsh",
    scan: {
      stdout: JSON.stringify([
        psRow(),
        psRow({
          Name: "Get-WindowsAutoPilotInfo",
          CurrentVersion: "3.9",
          LatestVersion: "3.10",
          Type: "Script",
        }),
      ]),
    },
  }),
  outdated: [
    SECRET_MANAGEMENT,
    {
      id: "Get-WindowsAutoPilotInfo",
      name: "Get-WindowsAutoPilotInfo",
      current: "3.9",
      latest: "3.10",
      note: "script",
    },
  ],
  update: {
    packageId: SECRET_MANAGEMENT.id,
    installs: [updateResourceArgv("pwsh", SECRET_MANAGEMENT.id)],
  },
  updateAll: "per-package",
};

/**
 * Windows PowerShell with the gallery module: one row (a bare JSON object),
 * kept although the host exited non-zero — one unreachable repository fails
 * `Find-PSResource` without voiding the rows that came back.
 */
const WINDOWS_POWERSHELL: ProviderContractCase = {
  scenario: "windows powershell",
  create: () => new PsResourceProvider(),
  system: psResourceMachine({
    shell: "powershell",
    scan: { stdout: JSON.stringify(psRow()), exitCode: 1 },
  }),
  outdated: [SECRET_MANAGEMENT],
  update: {
    packageId: SECRET_MANAGEMENT.id,
    installs: [updateResourceArgv("powershell", SECRET_MANAGEMENT.id)],
  },
  updateAll: "per-package",
};

export const psResourceCases: readonly ProviderContractCase[] = [PWSH, WINDOWS_POWERSHELL];
