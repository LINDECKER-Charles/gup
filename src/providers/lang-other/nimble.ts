import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface NimblePackageEntry {
  name?: string;
  url?: string;
}

/**
 * Nimble â€” Nim's package manager. We list user-installed packages with
 * `nimble list --installed`, then resolve each name to its upstream Git repo
 * via the canonical packages.json registry. Only GitHub-hosted packages get a
 * real "latest" check (release tag); everything else is dropped â€” keeping the
 * provider automation-only as the rest of the codebase requires.
 *
 * `nimble list -i -y` output:
 *   "<name>  [<version>]"
 */
export class NimbleProvider implements Provider {
  readonly id = "nimble";
  readonly displayName = "Nimble (Nim)";
  readonly installHint = "https://nim-lang.org/install.html";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("nimble");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const installed = await this.listInstalled();
    if (installed.length === 0) return [];

    const registry = await fetchNimRegistry();
    if (!registry) return [];

    const limit = pLimit(6);
    const results = await Promise.all(
      installed.map((p) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const url = registry.get(p.name.toLowerCase());
          if (!url) return null;
          const ownerRepo = parseGitHubOwnerRepo(url);
          if (!ownerRepo) return null;
          const latest = await fetchGitHubReleaseTag(ownerRepo);
          if (!latest || latest === p.current) return null;
          return { id: p.name, name: p.name, current: p.current, latest };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nimble", ["install", packageId, "-y"]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }

  private async listInstalled(): Promise<Array<{ name: string; current: string }>> {
    const { stdout, failed } = await run("nimble", ["list", "--installed"]);
    if (failed) return [];
    const out: Array<{ name: string; current: string }> = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      const m = line.match(/^([A-Za-z0-9_-]+)\s+\[([0-9][\w.+-]*)\]/);
      if (!m) continue;
      const [, name, current] = m;
      if (!name || !current) continue;
      out.push({ name, current });
    }
    return out;
  }
}

async function fetchNimRegistry(): Promise<Map<string, string> | null> {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/nim-lang/packages/master/packages.json",
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NimblePackageEntry[];
    const map = new Map<string, string>();
    for (const entry of data) {
      if (entry.name && entry.url) map.set(entry.name.toLowerCase(), entry.url);
    }
    return map;
  } catch {
    return null;
  }
}

function parseGitHubOwnerRepo(url: string): string | null {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
  if (!m?.[1] || !m[2]) return null;
  return `${m[1]}/${m[2]}`;
}

async function fetchGitHubReleaseTag(ownerRepo: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ownerRepo}/releases/latest`,
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ? data.tag_name.replace(/^v/, "") : null;
  } catch {
    return null;
  }
}
