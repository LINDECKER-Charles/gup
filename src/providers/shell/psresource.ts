import {
  commandExists,
  run,
  runInherit,
  type RunResult,
} from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Microsoft.PowerShell.PSResourceGet — the v3 PowerShell package manager,
 * shipped in the box since PowerShell 7.4.0 GA and the way new installs are
 * meant to happen from now on.
 *
 * Scope split with the sibling provider `pwsh-modules`
 * (src/providers/shell/pwsh-modules.ts):
 *  - `pwsh-modules` scans through PowerShellGet v2 (`Get-InstalledModule` +
 *    `Find-Module`). It sees modules only, and only those v2 knows about.
 *  - this provider scans through PSResourceGet (`Get-InstalledPSResource` +
 *    `Find-PSResource`), documented as "equivalent to the combined output of
 *    the Get-InstalledModule and Get-InstalledScript cmdlets from PowerShellGet
 *    v2". So it is the only one of the two that reports installed *scripts*,
 *    and the only one that reports anything installed with `Install-PSResource`.
 *
 * The two inventories can overlap on plain modules — both walk the same
 * install roots looking for the `PSGetModuleInfo.xml` sidecar — which means a
 * module may surface twice, once per provider. That is tolerated rather than
 * deduplicated: rows are provider-prefixed in the UI, both point at the same
 * gallery version, and whichever one the user applies makes the other row
 * disappear on the next scan. Suppressing one side would instead hide real
 * work whenever the two disagree.
 *
 * Deliberately out of scope:
 *  - **prereleases**. Neither `Find-PSResource` nor `Update-PSResource` is
 *    given `-Prerelease`, so gup only ever offers the highest *released*
 *    version. An installed `2.3.0-beta1` is compared on its `System.Version`
 *    part (`2.3.0`) and is therefore not reported as upgradable to the
 *    released `2.3.0` — under-reporting, chosen over proposing an "upgrade"
 *    that resolves to what is already on disk.
 *  - **the AllUsers store**. Updates always land in `-Scope CurrentUser`, so
 *    no row ever needs `requiresAdmin` and no UAC/sudo prompt is triggered.
 *  - **cross-provider dedup** with `pwsh-modules`, which would need shared
 *    state between providers.
 *
 * Not gated on Windows: PowerShell 7 is cross-platform, and so is PSGallery.
 */
export class PsResourceProvider implements Provider {
  readonly id = "psresource";
  readonly displayName = "PowerShell PSResourceGet";
  readonly installHint = pickInstallHint({
    win32:
      "Fourni avec PowerShell 7.4+ : `winget install Microsoft.PowerShell` — sinon `Install-Module Microsoft.PowerShell.PSResourceGet`",
    fallback:
      "Fourni avec PowerShell 7.4+ : `brew install powershell` — sinon `Install-Module Microsoft.PowerShell.PSResourceGet`",
  });
  // One `Find-PSResource` round-trip to the gallery per installed resource,
  // exactly like pwsh-modules.
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    const shell = await pickShell();
    if (!shell) return false;
    // A PowerShell host is not enough: PSResourceGet is in-box only from 7.4,
    // and on 5.1 / older 7.x it is an optional gallery module. Probing the
    // cmdlet itself is the only honest availability signal. `Get-Command`
    // resolves it from PSModulePath without importing anything.
    const probe = await tryRun(shell, [...HOST_ARGS, PROBE_SCRIPT], PROBE_TIMEOUT_MS);
    return probe !== null && !probe.failed && probe.stdout.trim() === "yes";
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const shell = await pickShell();
    if (!shell) return [];
    const res = await tryRun(shell, [...HOST_ARGS, SCAN_SCRIPT], SCAN_TIMEOUT_MS);
    if (!res) return [];
    // Parsed even when the host exited non-zero: a single unreachable
    // repository makes `Find-PSResource` fail without invalidating the rows
    // that did come back.
    return parsePsResourceOutdated(res.stdout);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const shell = await pickShell();
    if (!shell) {
      return {
        id: packageId,
        success: false,
        message: "Aucun hôte PowerShell trouvé sur le PATH.",
      };
    }
    try {
      const res = await runInherit(shell, [...HOST_ARGS, updateScript(packageId)]);
      return { id: packageId, success: !res.failed };
    } catch (err) {
      return { id: packageId, success: false, message: describeError(err) };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    // No bulk form: `Update-PSResource` without -Name defaults to `*` (the
    // documented default value), which would also touch resources gup never
    // reported as outdated.
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

const HOST_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

// A cold PowerShell start plus module discovery, generously bounded.
const PROBE_TIMEOUT_MS = 20_000;
// One gallery round-trip per installed resource: an Az-sized inventory is
// legitimately slow, a wedged host must still not pin a scan slot forever.
const SCAN_TIMEOUT_MS = 180_000;

const PROBE_SCRIPT =
  "if (Get-Command Get-InstalledPSResource -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }";

/**
 * Same host selection as pwsh-modules: PowerShell 7 first (it is where
 * PSResourceGet is in-box), Windows PowerShell 5.1 as a fallback for machines
 * where the module was installed from the gallery.
 */
async function pickShell(): Promise<string | null> {
  try {
    if (await commandExists("pwsh")) return "pwsh";
    if (await commandExists("powershell")) return "powershell";
  } catch {
    /* PATH probe blew up — indistinguishable from "no host" for our purposes */
  }
  return null;
}

/**
 * `run` rejects rather than resolves on a few paths (argv sanitisation in
 * core/runner.ts, spawn-level failures), and a rejection escaping `isAvailable`
 * or `listOutdated` marks the whole provider as errored mid-scan. Everything
 * here degrades to "nothing to report" instead.
 */
async function tryRun(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult | null> {
  try {
    return await run(command, args, { timeout: timeoutMs });
  } catch {
    return null;
  }
}

function describeError(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `Échec de la mise à jour PSResourceGet : ${detail}`;
}

/**
 * `Get-InstalledPSResource` lists every side-by-side version of a resource
 * (that is by design — `Update-PSResource` installs next to the old version
 * instead of replacing it), so the raw list holds several rows per name. Only
 * the highest one is meaningful for an "is something newer available" answer;
 * the hashtable collapses the rest. PowerShell hashtable keys are
 * case-insensitive, which matches how the gallery treats resource names. The
 * tie-break on equal versions prefers the released build over a prerelease of
 * the same number, so the reported "current" is the highest thing installed.
 *
 * `PSResourceInfo.Version` is a `System.Version`, so `-gt` is a numeric
 * component-wise comparison, never a string one (`1.10` sorts above `1.9`).
 * The prerelease label lives in the separate `Prerelease` string property: it
 * is carried into the displayed current version but takes no part in the
 * comparison — see the "deliberately out of scope" note at the top of the file.
 *
 * `Find-PSResource -Name x` returns the highest non-prerelease version, and
 * walks registered repositories in priority order; `Select-Object -First 1`
 * keeps the highest-priority hit, which is the repository `Update-PSResource`
 * documents itself as updating from.
 */
const SCAN_SCRIPT = `
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

/**
 * `-Scope CurrentUser` keeps the update out of the machine-wide store, so no
 * UAC / sudo prompt is ever needed and rows never have to carry
 * `requiresAdmin`. Consequence worth knowing: updating a resource that was
 * originally installed AllUsers writes a fresh copy under the user profile
 * rather than upgrading the shared one — the user copy wins at import time,
 * which is the outcome someone asking gup for an update wants.
 *
 * `-TrustRepository` is mandatory for an unattended run: PSGallery is
 * registered untrusted by default, and the trust prompt would hang a
 * `-NonInteractive` host. `-AcceptLicense` covers the same hazard for
 * resources that require a license agreement, and `-Confirm:$false` covers the
 * third one — the cmdlet declares ShouldProcess support, and a confirmation
 * prompt in a `-NonInteractive` host is auto-declined, which would look like a
 * successful no-op run.
 *
 * The name is single-quoted with embedded quotes doubled — PowerShell's own
 * escaping rule for literal strings, where the backtick is not an escape
 * character — exactly like the `Update-Module` call in pwsh-modules.
 */
function updateScript(packageId: string): string {
  const name = packageId.replace(/'/g, "''");
  return `Update-PSResource -Name '${name}' -Scope CurrentUser -TrustRepository -AcceptLicense -Confirm:$false`;
}

interface PsResourceRow {
  Name: string;
  CurrentVersion: string;
  LatestVersion: string;
  Type?: string;
}

/**
 * `ConvertTo-Json` emits a bare object (not a one-element array) when the
 * pipeline produced a single item, and the literal `null` when it produced
 * nothing — both shapes have to collapse to a list here. Exported for direct
 * unit testing: it is the only part of this provider that can run without a
 * PowerShell host.
 */
export function parsePsResourceOutdated(stdout: string): OutdatedPackage[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const values = Array.isArray(parsed) ? parsed : [parsed];
  const out: OutdatedPackage[] = [];
  for (const value of values) {
    const row = toRow(value);
    if (!row) continue;
    if (!isNewer(row.CurrentVersion, row.LatestVersion)) continue;
    out.push(toPackage(row));
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRow(value: unknown): PsResourceRow | null {
  if (!isRecord(value)) return null;
  const { Name, CurrentVersion, LatestVersion, Type } = value;
  if (typeof Name !== "string" || Name.length === 0) return null;
  if (typeof CurrentVersion !== "string" || CurrentVersion.length === 0) return null;
  if (typeof LatestVersion !== "string" || LatestVersion.length === 0) return null;
  return {
    Name,
    CurrentVersion,
    LatestVersion,
    ...(typeof Type === "string" && Type.length > 0 && { Type }),
  };
}

function toPackage(row: PsResourceRow): OutdatedPackage {
  const note = describeResourceType(row.Type);
  return {
    id: row.Name,
    name: row.Name,
    current: row.CurrentVersion,
    latest: row.LatestVersion,
    ...(note !== undefined && { note }),
  };
}

/**
 * Scripts are the half of the inventory that `pwsh-modules` structurally
 * cannot see, so flagging them is what tells the user why this row exists
 * here. Modules stay unannotated — a note on every line would be noise.
 * `PSResourceInfo.Type` is a `ResourceType` enum whose members are `None`,
 * `Module`, `Script` and `Nupkg`.
 */
function describeResourceType(type: string | undefined): string | undefined {
  return type === "Script" ? "script" : undefined;
}

interface ParsedVersion {
  /** Dotted numeric components of the version, most significant first. */
  core: number[];
  /** NuGet prerelease label, empty for a released version. */
  pre: string;
}

/**
 * Second line of defence behind the PowerShell-side `-gt`: a row whose latest
 * is not strictly newer than its current is dropped here rather than shown as
 * a no-op upgrade. Comparison is component-wise numeric, never lexicographic,
 * so `1.10.0` correctly ranks above `1.9.0`.
 *
 * When either side is not a dotted numeric version the row is kept: the scan
 * script already filtered on `System.Version` ordering, and silently dropping
 * a row we merely failed to re-parse would hide real work.
 */
function isNewer(current: string, latest: string): boolean {
  if (current.trim() === latest.trim()) return false;
  const cur = parseVersion(current);
  const lat = parseVersion(latest);
  if (!cur || !lat) return true;
  const cmp = compareSegments(cur.core, lat.core);
  if (cmp !== 0) return cmp < 0;
  // Identical numeric cores: NuGet orders a prerelease below its own release,
  // so `2.3.0-beta1` → `2.3.0` is an upgrade and the reverse is a downgrade.
  return cur.pre.length > 0 && lat.pre.length === 0;
}

function parseVersion(value: string): ParsedVersion | null {
  const [core = "", ...rest] = value.trim().split("-");
  const segments = core.split(".").map((part) => Number(part));
  if (segments.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return { core: segments, pre: rest.join("-") };
}

/** Negative when `a` ranks below `b`, positive above, 0 when equal. */
function compareSegments(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    // `System.Version` renders as 2 to 4 components, so `1.2` and `1.2.0.0`
    // are the same version and the missing tail reads as zero.
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}
