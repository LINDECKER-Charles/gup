import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Julia's built-in `Pkg`. We use the General registry's status report:
 *   `julia --project=@. -e 'using Pkg; Pkg.update(); Pkg.status(outdated=true)'`
 * would update first; we want a *read* pass for the scan, so:
 *   `julia -e 'using Pkg; Pkg.status(outdated=true)'`
 *
 * Output lines look like:
 *   "  [12345abc] PackageName v1.2.3 (<v1.3.0)"
 * The "(<vX)" marker indicates the latest available â€” that's our parse target.
 *
 * Update is a single global `Pkg.update()` since Julia resolves the whole
 * environment together; we don't expose per-package updates.
 */
export class JuliaPkgProvider implements Provider {
  readonly id = "julia-pkg";
  readonly displayName = "Julia Pkg";
  readonly installHint = "https://julialang.org/downloads/";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("julia");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("julia", [
      "--startup-file=no",
      "-e",
      "using Pkg; Pkg.status(outdated=true)",
    ]);
    if (failed) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      // "[uuid] Name vCURRENT (<vLATEST)"
      const m = line.match(
        /^\[[0-9a-f-]+\]\s+([\w.-]+)\s+v?([0-9][\w.+-]*)\s+\(<\s*v?([0-9][\w.+-]*)\)/i,
      );
      if (!m) continue;
      const [, name, current, latest] = m;
      if (!name || !current || !latest) continue;
      out.push({ id: name, name, current, latest });
    }
    return out;
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // Julia resolves the whole environment; per-package updates aren't meaningful.
    const res = await runInherit("julia", [
      "--startup-file=no",
      "-e",
      "using Pkg; Pkg.update()",
    ]);
    return { id: "julia-pkg", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("julia", [
      "--startup-file=no",
      "-e",
      "using Pkg; Pkg.update()",
    ]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
