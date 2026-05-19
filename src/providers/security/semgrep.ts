import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * Semgrep (static analyzer). Distributed via pip â€” we update through pip
 * to keep the upgrade path independent of how it was installed. `semgrep
 * --version` prints just the version, e.g. "1.79.0".
 */
export class SemgrepProvider implements Provider {
  readonly id = "semgrep";
  readonly displayName = "Semgrep";
  readonly installHint = "pip install --user semgrep";

  async isAvailable(): Promise<boolean> {
    return commandExists("semgrep");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("semgrep", ["--version"]);
    if (failed) return [];

    const match = stdout.trim().match(/^v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("semgrep");
    if (!latest || latest === current) return [];

    return [{ id: "semgrep", name: "Semgrep", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const pip = (await commandExists("python")) ? "python" : "py";
    const res = await runInherit(pip, [
      "-m",
      "pip",
      "install",
      "--user",
      "--upgrade",
      "semgrep",
    ]);
    return { id: "semgrep", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("semgrep")];
  }
}

async function fetchPypiLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PypiJson;
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}
