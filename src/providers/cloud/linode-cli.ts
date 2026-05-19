import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * Linode CLI. Distributed via PyPI as `linode-cli`. Upgrade is driven through
 * pip --user to remain neutral on the original install path.
 *
 * `linode-cli --version` prints "linode-cli 5.50.0\nCopyright ...".
 */
export class LinodeCliProvider implements Provider {
  readonly id = "linode-cli";
  readonly displayName = "Linode CLI";
  readonly installHint = "pip install --user linode-cli";

  async isAvailable(): Promise<boolean> {
    return commandExists("linode-cli");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("linode-cli", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/linode-cli\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("linode-cli");
    if (!latest || latest === current) return [];

    return [{ id: "linode-cli", name: "Linode CLI", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const bin = await pickPip();
    if (!bin) {
      return {
        id: "linode-cli",
        success: false,
        skipped: true,
        message: "pip/python introuvable",
      };
    }
    const res = await runInherit(bin.cmd, [
      ...bin.args,
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "linode-cli",
    ]);
    return { id: "linode-cli", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("linode-cli")];
  }
}

async function pickPip(): Promise<{ cmd: string; args: string[] } | null> {
  if (await commandExists("python")) return { cmd: "python", args: ["-m", "pip"] };
  if (await commandExists("py")) return { cmd: "py", args: ["-m", "pip"] };
  if (await commandExists("pip")) return { cmd: "pip", args: [] };
  if (await commandExists("pip3")) return { cmd: "pip3", args: [] };
  return null;
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
