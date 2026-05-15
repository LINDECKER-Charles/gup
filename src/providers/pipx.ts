import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

interface PipxVenv {
  metadata: {
    main_package: {
      package: string;
      package_or_url: string;
      package_version: string;
    };
  };
}

interface PipxListResponse {
  venvs: Record<string, PipxVenv>;
}

/**
 * pipx has no native "outdated" command. We list installed apps then query
 * PyPI JSON API for the latest version of each.
 */
export class PipxProvider implements Provider {
  readonly id = "pipx";
  readonly displayName = "pipx";
  readonly installHint = "python -m pip install --user pipx";

  async isAvailable(): Promise<boolean> {
    return commandExists("pipx");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("pipx", ["list", "--json"]);
    if (!stdout.trim()) return [];

    let parsed: PipxListResponse;
    try {
      parsed = JSON.parse(stdout) as PipxListResponse;
    } catch {
      return [];
    }

    const results = await Promise.all(
      Object.values(parsed.venvs).map(async (v): Promise<OutdatedPackage | null> => {
        const pkg = v.metadata.main_package;
        const latest = await fetchPypiLatest(pkg.package);
        if (!latest || latest === pkg.package_version) return null;
        return {
          id: pkg.package,
          name: pkg.package,
          current: pkg.package_version,
          latest,
        };
      }),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("pipx", ["upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("pipx", ["upgrade-all"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

async function fetchPypiLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { info?: { version?: string } };
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}
