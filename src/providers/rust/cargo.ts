import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Requires `cargo-update` plugin: `cargo install cargo-update`.
 * `cargo install-update -l` lists installed crates with current vs latest.
 */
export class CargoProvider implements Provider {
  readonly id = "cargo";
  readonly displayName = "Cargo (Rust)";
  readonly installHint = "rustup + `cargo install cargo-update`";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("cargo"))) return false;
    const probe = await run("cargo", ["install-update", "--version"]);
    return !probe.failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("cargo", ["install-update", "-l"]);
    const lines = stdout.split(/\r?\n/);
    const headerIdx = lines.findIndex((l) =>
      /Package\s+Installed\s+Latest/i.test(l),
    );
    if (headerIdx === -1) return [];
    return lines
      .slice(headerIdx + 2)
      .map(parseCargoRow)
      .filter((p): p is OutdatedPackage => p !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("cargo", ["install-update", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("cargo", ["install-update", "-a"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

/**
 * Une ligne du tableau `cargo install-update -l`, ou null quand ce n'est pas
 * un paquet à proposer : séparateur, colonnes manquantes, versions identiques,
 * ou « Latest » qui n'est pas un numéro de version (`cargo` y écrit parfois
 * `Yes`/`No` selon la version du plugin).
 */
function parseCargoRow(line: string): OutdatedPackage | null {
  if (!line.trim() || /^-+/.test(line)) return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const [name, , current, latest] = parts;
  if (!name || !current || !latest || current === latest) return null;
  if (!/^v?\d/.test(latest)) return null;
  return { id: name, name, current, latest };
}
