import pLimit from "p-limit";
import { isCorepackShim } from "../../core/corepack-ownership.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Corepack — Node.js' built-in shim for pnpm / yarn. We only surface the
 * package managers Corepack actually serves (i.e. the binary on PATH resolves
 * to a Corepack shim) and compare their versions to the npm registry.
 *
 * Update path: `corepack use <pm>@latest` (pins in the current project) is
 * not what we want here — we want the *global* default, hence
 * `corepack prepare <pm>@latest --activate`.
 *
 * Skipped when corepack isn't enabled (the shims aren't on PATH yet), since
 * scanning has nothing to act on.
 */
export class CorepackProvider implements Provider {
  readonly id = "corepack";
  readonly displayName = "Corepack";
  readonly installHint = "Bundled with Node.js ≥ 14.19 — `corepack enable`";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("corepack");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const managers = await this.detectManagedBinaries();
    if (managers.length === 0) return [];

    const limit = pLimit(4);
    const results = await Promise.all(
      managers.map((m) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchNpmLatest(m.name);
          if (!latest || latest === m.current) return null;
          return { id: m.name, name: m.name, current: m.current, latest };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("corepack", [
      "prepare",
      `${packageId}@latest`,
      "--activate",
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }

  private async detectManagedBinaries(): Promise<
    Array<{ name: string; current: string }>
  > {
    const candidates = ["pnpm", "yarn"] as const;
    const out: Array<{ name: string; current: string }> = [];
    for (const name of candidates) {
      if (!(await commandExists(name))) continue;
      // Only claim ownership if the binary on PATH is actually a corepack
      // shim; otherwise `corepack prepare --activate` would update a cache
      // that nothing on PATH consults, leaving the resolved version unchanged.
      if (!(await isCorepackShim(name))) continue;
      const { stdout, failed } = await run(name, ["--version"]);
      if (failed) continue;
      const current = stdout.trim().split(/\r?\n/)[0]?.trim();
      if (!current || !/^\d/.test(current)) continue;
      out.push({ name, current });
    }
    return out;
  }
}

async function fetchNpmLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}
