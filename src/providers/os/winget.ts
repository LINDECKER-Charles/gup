import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type {
  OutdatedPackage,
  Provider,
  UpdateOptions,
  UpdateOutcome,
} from "../../core/types.js";

/**
 * Winget has no machine-readable output for `upgrade`.
 * Strategy: parse the fixed-width text table, locating columns by header offsets.
 * Resilient to localized headers (FR/EN) thanks to position-based slicing.
 */
export class WingetProvider implements Provider {
  readonly id = "winget";
  readonly displayName = "Winget";
  readonly installHint = pickInstallHint({
    win32: "Pré-installé sur Windows 11. Sinon: https://aka.ms/getwinget",
    fallback:
      "Winget est un composant Windows — il n'existe pas sur cette plateforme.",
  });

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

  async update(
    packageId: string,
    options?: UpdateOptions,
  ): Promise<UpdateOutcome> {
    if (options?.reinstall) {
      return this.reinstall(packageId, options);
    }

    const args = [
      "upgrade",
      "--id",
      packageId,
      "--exact",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--include-unknown",
    ];
    if (options?.force) args.push("--force");
    if (options?.uninstallPrevious) args.push("--uninstall-previous");

    const res = await runInherit("winget", args);
    if (!res.failed) return { id: packageId, success: true };
    // Retryable until the explicit uninstall+install fallback has been
    // attempted. Earlier tiers (--force, --uninstall-previous) sometimes
    // refuse to proceed (unknown current version, "no applicable upgrade",
    // technology change detected post-download) — the CLI walks through
    // progressively more aggressive strategies on subsequent passes.
    return { id: packageId, success: false, retryable: true };
  }

  /**
   * Explicit two-step replace: `winget uninstall` then `winget install`.
   * Used as a last-resort retry when `winget upgrade --uninstall-previous`
   * refuses to enter its uninstall phase (e.g. version "Unknown", or the
   * upgrade is rejected before uninstall is even considered).
   *
   * Proceeds to install even if uninstall reports failure: winget sometimes
   * cannot match the installed entry (broken ARP entries, version mismatch),
   * but a forced install can still recover the package.
   */
  private async reinstall(
    packageId: string,
    options: UpdateOptions,
  ): Promise<UpdateOutcome> {
    const baseArgs = [
      "--id",
      packageId,
      "--exact",
      "--silent",
      "--accept-source-agreements",
    ];
    await runInherit("winget", ["uninstall", ...baseArgs]);

    const installArgs = [
      "install",
      ...baseArgs,
      "--accept-package-agreements",
      "--include-unknown",
    ];
    if (options.force !== false) installArgs.push("--force");

    const res = await runInherit("winget", installArgs);
    if (!res.failed) return { id: packageId, success: true };
    return { id: packageId, success: false };
  }

  async updateAll(
    packages: OutdatedPackage[],
    options?: UpdateOptions,
  ): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) {
      outcomes.push(await this.update(pkg.id, options));
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

export interface WingetRow {
  name: string;
  id: string;
  version: string;
  available: string;
}

/**
 * Winget emits *two* upgrade tables: the regular one, then a second
 * "require explicit targeting" table (pinned / version-locked packages).
 * Both must be parsed, otherwise some upgrades are silently skipped.
 * Tables are detected by header line; column offsets are recomputed per
 * table since column widths depend on the rows that follow.
 */
export function parseWingetTable(output: string): WingetRow[] {
  // Winget streams a progress spinner using bare \r (carriage returns), which
  // would otherwise glue the spinner frames onto the header line and skew the
  // column offsets. Keep only the final segment after the last \r per line.
  const lines = output.split(/\r?\n/).map((l) => {
    const idx = l.lastIndexOf("\r");
    return idx === -1 ? l : l.slice(idx + 1);
  });
  const headerRe = /(Name|Nom)\s+(Id)\s+(Version)\s+(Available|Disponible)/i;
  const rows: WingetRow[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    if (!headerRe.test(lines[i] ?? "")) {
      i++;
      continue;
    }

    const header = lines[i] ?? "";
    const separator = lines[i + 1] ?? "";
    if (!/^-+/.test(separator)) {
      i++;
      continue;
    }

    const cols = locateColumns(header);
    if (!cols) {
      i++;
      continue;
    }

    i += 2;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      if (!line.trim() || /^-+/.test(line)) {
        i++;
        continue;
      }
      // End of table: hit a non-row marker (counts, explanatory text, next header).
      if (headerRe.test(line)) break;
      if (/^\s*\d+\s+(upgrades?|package|mises?\s+à)/i.test(line)) {
        i++;
        continue;
      }
      // Heuristic: a real row has an Id (no spaces) at the Id column.
      const idCell = line.slice(cols.id, cols.version).trim();
      if (!idCell || /\s/.test(idCell)) {
        i++;
        continue;
      }

      if (!seen.has(idCell)) {
        seen.add(idCell);
        rows.push({
          name: line.slice(cols.name, cols.id).trim(),
          id: idCell,
          version: line.slice(cols.version, cols.available).trim(),
          available: line.slice(cols.available, cols.source).trim(),
        });
      }
      i++;
    }
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
  // Case-insensitive lookup: winget FR emits "ID" while EN emits "Id".
  const lower = header.toLowerCase();
  const find = (...labels: string[]): number => {
    for (const label of labels) {
      const idx = lower.indexOf(label.toLowerCase());
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
