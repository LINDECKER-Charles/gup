import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * Krew: plugins manager for kubectl. No native "outdated" command —
 * we list installed plugins, then fetch each plugin's manifest from the
 * krew-index repo and compare versions.
 */
export class KrewProvider implements Provider {
  readonly id = "krew";
  readonly displayName = "Krew (kubectl plugins)";
  readonly installHint = "https://krew.sigs.k8s.io/docs/user-guide/setup/install/";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("kubectl"))) return false;
    const probe = await run("kubectl", ["krew", "version"]);
    return !probe.failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("kubectl", ["krew", "list"]);
    if (failed) return [];

    const installed = parseKrewList(stdout);
    if (installed.length === 0) return [];

    const limit = pLimit(6);
    const results = await Promise.all(
      installed.map((plugin) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchKrewPluginVersion(plugin.name);
          if (!latest) return null;
          if (normalizeKrewVersion(latest) === normalizeKrewVersion(plugin.current))
            return null;
          return {
            id: plugin.name,
            name: plugin.name,
            current: plugin.current,
            latest,
          };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("kubectl", ["krew", "upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("kubectl", ["krew", "upgrade"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

function parseKrewList(output: string): Array<{ name: string; current: string }> {
  const out: Array<{ name: string; current: string }> = [];
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^PLUGIN\s+VERSION/i.test(l));
  if (headerIdx === -1) return [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [name, version] = parts;
    if (!name || !version) continue;
    out.push({ name, current: version });
  }
  return out;
}

async function fetchKrewPluginVersion(name: string): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/kubernetes-sigs/krew-index/master/plugins/${encodeURIComponent(name)}.yaml`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const text = await res.text();
    // YAML root-level `version: <v>` — manifests are simple enough for regex.
    const match = text.match(/^\s*version:\s*"?([^"\r\n]+)"?\s*$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

function normalizeKrewVersion(v: string): string {
  return v.trim().replace(/^v/, "").toLowerCase();
}
