import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * `uv tool list` enumerates apps installed via `uv tool install` (pipx-like).
 * Latest versions come from PyPI's JSON API.
 */
export class UvToolsProvider implements Provider {
  readonly id = "uv-tools";
  readonly displayName = "uv tools";
  readonly installHint = "https://docs.astral.sh/uv";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("uv"))) return false;
    const probe = await run("uv", ["tool", "list"]);
    return !probe.failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("uv", ["tool", "list"]);
    if (failed) return [];

    // Format: "<name> v<version>\n- <bin>\n- <bin>\n..."
    const installed: { name: string; current: string }[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("-")) continue;
      const m = line.match(/^([\w.-]+)\s+v([\w.+!-]+)/);
      if (!m) continue;
      const [, name, current] = m;
      if (!name || !current) continue;
      installed.push({ name, current });
    }
    if (installed.length === 0) return [];

    const results = await Promise.all(
      installed.map(async (p): Promise<OutdatedPackage | null> => {
        const latest = await fetchPypiLatest(p.name);
        if (!latest || latest === p.current) return null;
        return { id: p.name, name: p.name, current: p.current, latest };
      }),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("uv", ["tool", "upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("uv", ["tool", "upgrade", "--all"]);
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
