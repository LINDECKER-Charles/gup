import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface MiseOutdatedEntry {
  name?: string;
  plugin?: string;
  requested?: string;
  current?: string;
  latest?: string;
  source?: { path?: string };
}

/**
 * `mise outdated --json` returns the list of installed tools that have a
 * newer version available. Works for every plugin mise manages
 * (node, python, go, terraform, ...).
 */
export class MiseProvider implements Provider {
  readonly id = "mise";
  readonly displayName = "mise (toolchains)";
  readonly installHint = pickInstallHint({
    win32: "https://mise.jdx.dev",
    fallback: "brew install mise",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("mise");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("mise", ["outdated", "--json"]);
    if (failed || !stdout.trim()) return [];

    return parseMiseEntries(stdout)
      .map(toOutdatedPackage)
      .filter((p): p is OutdatedPackage => p !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("mise", ["upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("mise", ["upgrade"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

/**
 * `mise outdated --json` changed shape between versions: an array of entries in
 * recent ones, an object keyed by tool name in older ones. Both are normalised
 * to an array; unreadable output means "nothing".
 */
function parseMiseEntries(stdout: string): MiseOutdatedEntry[] {
  let parsed: MiseOutdatedEntry[] | Record<string, MiseOutdatedEntry>;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  return Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed).map(([k, v]) => ({ name: k, ...v }));
}

function toOutdatedPackage(e: MiseOutdatedEntry): OutdatedPackage | null {
  const plugin = e.plugin ?? e.name;
  const current = e.current ?? e.requested;
  const latest = e.latest;
  if (!plugin || !current || !latest || current === latest) return null;
  return { id: plugin, name: plugin, current, latest };
}
