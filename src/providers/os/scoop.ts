import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Scoop ships no JSON output for `status`. We invoke its PS module directly
 * via `powershell` to leverage `Get-ScoopOutdated`-style data parsing.
 * Fallback: parse plaintext columns of `scoop status`.
 */
export class ScoopProvider implements Provider {
  readonly id = "scoop";
  readonly displayName = "Scoop";
  readonly installHint =
    "iwr -useb get.scoop.sh | iex   (https://scoop.sh)";

  async isAvailable(): Promise<boolean> {
    return commandExists("scoop");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("scoop", ["status"]);
    return parseScoopStatus(stdout);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("scoop", ["update", packageId], { shell: true });
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("scoop", ["update", "*"], { shell: true });
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

export function parseScoopStatus(output: string): OutdatedPackage[] {
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) =>
    /^\s*Name\s+Installed Version\s+Latest Version/i.test(l),
  );
  if (headerIdx === -1) return [];

  const out: OutdatedPackage[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) break;
    // Columns are whitespace-separated; package names are not allowed to contain spaces.
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 3) continue;
    const [name, current, latest, ...rest] = parts;
    if (!name || !current || !latest || current === latest) continue;
    out.push({
      id: name,
      name,
      current,
      latest,
      ...(rest.length > 0 && { note: rest.join(" ") }),
    });
  }
  return out;
}
