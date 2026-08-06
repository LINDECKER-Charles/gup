import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * Poetry self-update. Only the Poetry binary itself — the dependencies it
 * manages live in per-project virtualenvs (out of scope for a global updater).
 *
 * `poetry --version --no-ansi` prints "Poetry (version 1.8.3)".
 */
export class PoetryProvider implements Provider {
  readonly id = "poetry";
  readonly displayName = "Poetry";
  readonly installHint = pickInstallHint({
    win32: "https://python-poetry.org/docs/#installation",
    fallback: "brew install poetry",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("poetry");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("poetry", ["--version", "--no-ansi"]);
    if (failed) return [];

    const match = stdout.match(/Poetry\s+\(version\s+v?([0-9][\w.+-]*)\)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("poetry");
    if (!latest || latest === current) return [];

    return [{ id: "poetry", name: "Poetry", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("poetry", ["self", "update"]);
    return { id: "poetry", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("poetry")];
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
