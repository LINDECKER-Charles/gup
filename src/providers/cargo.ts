import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

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
    const out: OutdatedPackage[] = [];
    const lines = stdout.split(/\r?\n/);
    const headerIdx = lines.findIndex((l) => /Package\s+Installed\s+Latest/i.test(l));
    if (headerIdx === -1) return [];

    for (let i = headerIdx + 2; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!line.trim() || /^-+/.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const [name, , current, latest] = parts;
      if (!name || !current || !latest || current === latest) continue;
      if (!/^v?\d/.test(latest)) continue;
      out.push({ id: name, name, current, latest });
    }
    return out;
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
