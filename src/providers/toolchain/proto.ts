import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface ProtoOutdatedEntry {
  current?: string;
  newest?: string;
  latest?: string;
}

/**
 * proto (moonrepo) â€” poly-runtime toolchain manager. Cross-platform binary.
 *
 * Scope split:
 *  - The proto binary itself is reported under id "proto" (latest via GitHub
 *    Releases, updated with `proto upgrade`).
 *  - Managed tools (node, deno, bun, go, ...) are reported as individual
 *    rows from `proto outdated --json`, each updated with
 *    `proto install <tool>`.
 *
 * `proto --version` prints "proto 0.40.4" (or "0.40.4" on older builds).
 */
export class ProtoProvider implements Provider {
  readonly id = "proto";
  readonly displayName = "proto (moonrepo)";
  readonly installHint = "https://moonrepo.dev/docs/proto/install";
  readonly slow = true; // `proto outdated` hits the network per managed tool.

  async isAvailable(): Promise<boolean> {
    return commandExists("proto");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const out: OutdatedPackage[] = [];

    const self = await scanSelf();
    if (self) out.push(self);

    out.push(...(await scanManagedTools()));
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    if (packageId === "proto") {
      const res = await runInherit("proto", ["upgrade"]);
      return { id: "proto", success: !res.failed };
    }
    const res = await runInherit("proto", ["install", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) {
      outcomes.push(await this.update(pkg.id));
    }
    return outcomes;
  }
}

async function scanSelf(): Promise<OutdatedPackage | null> {
  const { stdout, failed } = await run("proto", ["--version"]);
  if (failed) return null;
  const match = stdout.match(/(?:proto\s+)?v?([0-9][\w.+-]*)/i);
  const current = match?.[1];
  if (!current) return null;

  const latest = await fetchGitHubReleaseLatest("moonrepo/proto");
  if (!latest || latest === current) return null;

  return { id: "proto", name: "proto", current, latest };
}

async function scanManagedTools(): Promise<OutdatedPackage[]> {
  const { stdout, failed } = await run("proto", ["outdated", "--json"]);
  if (failed || !stdout.trim()) return [];

  let parsed: Record<string, ProtoOutdatedEntry> | ProtoOutdatedEntry[];
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const entries: Array<[string, ProtoOutdatedEntry]> = Array.isArray(parsed)
    ? parsed.map((e, i) => [String(i), e])
    : Object.entries(parsed);

  const out: OutdatedPackage[] = [];
  for (const [name, e] of entries) {
    const current = e.current;
    const latest = e.newest ?? e.latest;
    if (!current || !latest || current === latest) continue;
    out.push({ id: name, name, current, latest });
  }
  return out;
}
