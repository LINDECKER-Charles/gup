import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface NugetSearchResponse {
  data: Array<{ id: string; version: string }>;
}

/**
 * `dotnet tool list -g` for installed versions, NuGet v3 search API for latest.
 */
export class DotnetToolsProvider implements Provider {
  readonly id = "dotnet-tools";
  readonly displayName = ".NET tools (global)";
  readonly installHint = "Install .NET SDK: https://dotnet.microsoft.com/download";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("dotnet");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("dotnet", ["tool", "list", "-g"]);
    const installed = parseDotnetToolList(stdout);
    if (installed.length === 0) return [];

    const limit = pLimit(6);
    const checked = await Promise.all(
      installed.map((tool) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchNugetLatest(tool.id);
          if (!latest || latest === tool.current) return null;
          return { id: tool.id, name: tool.id, current: tool.current, latest };
        }),
      ),
    );
    return checked.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("dotnet", ["tool", "update", "-g", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

function parseDotnetToolList(output: string): Array<{ id: string; current: string }> {
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^Package Id\s+Version\s+Commands/i.test(l));
  if (headerIdx === -1) return [];
  const out: Array<{ id: string; current: string }> = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [id, current] = parts;
    if (id && current) out.push({ id, current });
  }
  return out;
}

async function fetchNugetLatest(pkgId: string): Promise<string | null> {
  try {
    const url = `https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(
      pkgId.toLowerCase(),
    )}&prerelease=false&take=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as NugetSearchResponse;
    return data.data[0]?.version ?? null;
  } catch {
    return null;
  }
}
