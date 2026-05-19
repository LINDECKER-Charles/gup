import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Yarn 1 only â€” Yarn 2+ deprecated `yarn global`. We auto-skip when the
 * detected yarn major is â‰¥ 2 (those users typically rely on volta/corepack
 * or per-project installs).
 *
 * Yarn 1 has no native "outdated --global"; we list installs and query the
 * npm registry per package for the latest version.
 */
export class YarnGlobalProvider implements Provider {
  readonly id = "yarn-g";
  readonly displayName = "yarn (global)";
  readonly installHint = "npm install -g yarn  (or corepack enable)";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("yarn"))) return false;
    const { stdout } = await run("yarn", ["--version"]);
    const major = parseInt(stdout.trim().split(".")[0] ?? "0", 10);
    return major === 1;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("yarn", ["global", "list", "--depth=0"]);
    const installed = parseYarnGlobalList(stdout);
    if (installed.length === 0) return [];

    const limit = pLimit(6);
    const results = await Promise.all(
      installed.map((pkg) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchNpmLatest(pkg.id);
          if (!latest || latest === pkg.current) return null;
          return { id: pkg.id, name: pkg.id, current: pkg.current, latest };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("yarn", ["global", "add", `${packageId}@latest`]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const args = ["global", "add", ...packages.map((p) => `${p.id}@latest`)];
    const res = await runInherit("yarn", args);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

function parseYarnGlobalList(output: string): Array<{ id: string; current: string }> {
  // yarn 1 format: info "package@version" has binaries: foo
  const out: Array<{ id: string; current: string }> = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/info\s+"([^@"]+)@([^"]+)"/);
    if (!match?.[1] || !match[2]) continue;
    out.push({ id: match[1], current: match[2] });
  }
  return out;
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
