import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Bun has no `outdated -g` flag yet. We list globally installed packages via
 * `bun pm ls -g` and resolve the latest version against the npm registry
 * (Bun consumes the same registry).
 */
export class BunGlobalProvider implements Provider {
  readonly id = "bun-g";
  readonly displayName = "Bun global";
  readonly installHint = pickInstallHint({
    win32: "https://bun.sh",
    fallback: "brew install bun",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("bun");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("bun", ["pm", "ls", "-g"]);
    if (failed) return [];

    // Output format: "<path>\n├── pkg@1.2.3\n└── @scope/pkg@4.5.6\n"
    const installed: { name: string; current: string }[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      const m = line.match(/^(?:├──|└──|[│ ]\s+)?\s*(@?[\w./-]+)@([0-9][^\s]*)/);
      if (!m) continue;
      const [, name, current] = m;
      if (!name || !current) continue;
      installed.push({ name, current });
    }
    if (installed.length === 0) return [];

    const results = await Promise.all(
      installed.map(async (p): Promise<OutdatedPackage | null> => {
        const latest = await fetchNpmLatest(p.name);
        if (!latest || latest === p.current) return null;
        return { id: p.name, name: p.name, current: p.current, latest };
      }),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("bun", ["add", "-g", `${packageId}@latest`]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("bun", ["update", "-g"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

function encodeNpmPackage(pkg: string): string {
  if (pkg.startsWith("@")) {
    const slash = pkg.indexOf("/");
    if (slash > 0) {
      return `@${encodeURIComponent(pkg.slice(1, slash))}/${encodeURIComponent(pkg.slice(slash + 1))}`;
    }
  }
  return encodeURIComponent(pkg);
}

async function fetchNpmLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeNpmPackage(pkg)}/latest`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}
