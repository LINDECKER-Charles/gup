import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * PlatformIO (`pio`). Distributed via pip â€” self-update goes through `pio upgrade`.
 * The CLI also manages embedded library/platform packages (`pio pkg update -g`)
 * but we keep the scope to the binary itself to avoid running long network
 * scans per global package.
 *
 * Version: `pio --version` -> "PlatformIO Core, version 6.1.15".
 */
export class PlatformIoProvider implements Provider {
  readonly id = "platformio";
  readonly displayName = "PlatformIO Core";
  readonly installHint = "pip install --user platformio";

  async isAvailable(): Promise<boolean> {
    return commandExists("pio");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("pio", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/PlatformIO\s+Core,?\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("platformio");
    if (!latest || latest === current) return [];

    return [{ id: "platformio", name: "PlatformIO Core", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("pio", ["upgrade"]);
    return { id: "platformio", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("platformio")];
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
