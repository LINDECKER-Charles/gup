import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * Oracle Cloud Infrastructure CLI. Distributed exclusively via PyPI as
 * `oci-cli`; we drive the upgrade through pip --user to stay independent of
 * the original install path (chocolatey, manual installer, etc.).
 *
 * `oci --version` prints the bare version, e.g. "3.40.2".
 */
export class OciCliProvider implements Provider {
  readonly id = "oci-cli";
  readonly displayName = "Oracle Cloud CLI";
  readonly installHint = "pip install --user oci-cli";

  async isAvailable(): Promise<boolean> {
    return commandExists("oci");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("oci", ["--version"]);
    if (failed) return [];

    const match = stdout.trim().match(/^v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("oci-cli");
    if (!latest || latest === current) return [];

    return [{ id: "oci-cli", name: "Oracle Cloud CLI", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const bin = await pickPip();
    if (!bin) {
      return {
        id: "oci-cli",
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
      "oci-cli",
    ]);
    return { id: "oci-cli", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("oci-cli")];
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
