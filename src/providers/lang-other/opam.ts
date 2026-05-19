import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * opam (OCaml package manager). Outdated detection uses
 *   `opam list --upgradable --short --columns=name,installed-version,version`
 * which prints one whitespace-separated row per package: `<name> <cur> <latest>`.
 *
 * Update path: `opam upgrade <pkg> -y` per package, or `opam upgrade -y` for
 * a bulk pass when the user picks "Update all". We always run `opam update`
 * first to refresh repository metadata (cheap, no install side-effects).
 */
export class OpamProvider implements Provider {
  readonly id = "opam";
  readonly displayName = "opam (OCaml)";
  readonly installHint = "https://opam.ocaml.org/doc/Install.html";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("opam");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    // Refresh metadata so `--upgradable` reflects upstream state.
    await run("opam", ["update", "--quiet"]);

    const { stdout, failed } = await run("opam", [
      "list",
      "--upgradable",
      "--short",
      "--columns=name,installed-version,version",
    ]);
    if (failed) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/\s+/).filter(Boolean);
      const [name, current, latest] = parts;
      if (!name || !current || !latest || current === latest) continue;
      out.push({ id: name, name, current, latest });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("opam", ["upgrade", packageId, "-y"]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("opam", ["upgrade", "-y"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
