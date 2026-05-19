import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Mix archives â€” globally installed Elixir archives (`mix archive.install`).
 * Typical residents: phx_new, hex itself, nerves_bootstrap. `mix archive`
 * prints one block per archive, version embedded in the directory name:
 *   "* hex-2.0.6"
 *
 * Update via `mix archive.install hex <name> --force` (re-fetches latest).
 */
export class MixArchiveProvider implements Provider {
  readonly id = "mix-archive";
  readonly displayName = "Mix archives";
  readonly installHint = "Installer Elixir + `mix archive.install hex ...`";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("mix"))) return false;
    const probe = await run("mix", ["archive"]);
    return !probe.failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("mix", ["archive"]);
    if (failed) return [];

    const installed: Array<{ name: string; current: string }> = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      const m = line.match(/^\*\s+([a-z0-9_]+)-([0-9][\w.+-]*)/i);
      if (!m) continue;
      const [, name, current] = m;
      if (!name || !current) continue;
      installed.push({ name, current });
    }
    if (installed.length === 0) return [];

    const limit = pLimit(6);
    const results = await Promise.all(
      installed.map((p) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchHexLatest(p.name);
          if (!latest || latest === p.current) return null;
          return { id: p.name, name: p.name, current: p.current, latest };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("mix", [
      "archive.install",
      "hex",
      packageId,
      "--force",
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

async function fetchHexLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://hex.pm/api/packages/${encodeURIComponent(pkg)}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      latest_stable_version?: string;
      latest_version?: string;
    };
    return data.latest_stable_version ?? data.latest_version ?? null;
  } catch {
    return null;
  }
}
