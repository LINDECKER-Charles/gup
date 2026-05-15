import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * Winget has no machine-readable output for `upgrade`.
 * Strategy: parse the fixed-width text table, locating columns by header offsets.
 * Resilient to localized headers (FR/EN) thanks to position-based slicing.
 */
export class WingetProvider implements Provider {
  readonly id = "winget";
  readonly displayName = "Winget";
  readonly installHint =
    "Pré-installé sur Windows 11. Sinon: https://aka.ms/getwinget";

  async isAvailable(): Promise<boolean> {
    return commandExists("winget");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("winget", [
      "upgrade",
      "--include-unknown",
      "--accept-source-agreements",
    ]);
    if (failed && !stdout) return [];

    const pinned = await this.getPinnedIds();
    const rows = parseWingetTable(stdout);

    return rows
      .filter((r) => r.id && r.available && r.version !== r.available)
      .map<OutdatedPackage>((r) => {
        const note = pinned.has(r.id)
          ? "pinned"
          : r.version === "unknown"
            ? "unknown version"
            : undefined;
        return {
          id: r.id,
          name: r.name || r.id,
          current: r.version || "?",
          latest: r.available,
          ...(note && { note }),
        };
      });
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("winget", [
      "upgrade",
      "--id",
      packageId,
      "--exact",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--include-unknown",
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) {
      outcomes.push(await this.update(pkg.id));
    }
    return outcomes;
  }

  private async getPinnedIds(): Promise<Set<string>> {
    const { stdout, failed } = await run("winget", ["pin", "list"]);
    if (failed) return new Set();
    const ids = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\S+\s+(\S+)\s+/);
      if (match?.[1]) ids.add(match[1]);
    }
    return ids;
  }
}

interface WingetRow {
  name: string;
  id: string;
  version: string;
  available: string;
}

function parseWingetTable(output: string): WingetRow[] {
  const lines = output.split(/\r?\n/);

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/(Name|Nom)\s+(Id)\s+(Version)\s+(Available|Disponible)/i.test(l)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = lines[headerIdx] ?? "";
  const separator = lines[headerIdx + 1] ?? "";
  if (!/^-+/.test(separator)) return [];

  const cols = locateColumns(header);
  if (!cols) return [];

  const rows: WingetRow[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim() || /^-+/.test(line)) continue;
    if (/upgrades available|mises à jour/i.test(line)) break;

    rows.push({
      name: line.slice(cols.name, cols.id).trim(),
      id: line.slice(cols.id, cols.version).trim(),
      version: line.slice(cols.version, cols.available).trim(),
      available: line.slice(cols.available, cols.source).trim(),
    });
  }
  return rows;
}

function locateColumns(header: string): {
  name: number;
  id: number;
  version: number;
  available: number;
  source: number;
} | null {
  const find = (...labels: string[]): number => {
    for (const label of labels) {
      const idx = header.indexOf(label);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const name = find("Name", "Nom");
  const id = find("Id");
  const version = find("Version");
  const available = find("Available", "Disponible");
  const source = find("Source");

  if ([name, id, version, available].some((v) => v === -1)) return null;
  return {
    name,
    id,
    version,
    available,
    source: source === -1 ? header.length : source,
  };
}
