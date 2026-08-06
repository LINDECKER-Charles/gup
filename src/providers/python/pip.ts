import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PipOutdatedEntry {
  name: string;
  version: string;
  latest_version: string;
  latest_filetype?: string;
}

/**
 * Global pip packages. `--user` only would miss system-installed ones,
 * but on Windows global writes typically need admin — we scope to `--user`.
 */
export class PipProvider implements Provider {
  readonly id = "pip";
  readonly displayName = "pip (user)";
  // macOS ships a python3 without pip and deprecates it; the usable Python is
  // the Homebrew one. Pointing a Mac user at python.org would install a third
  // interpreter next to the two already there.
  readonly installHint = pickInstallHint({
    darwin: "brew install python",
    fallback: "Python: https://www.python.org/downloads/",
  });

  async isAvailable(): Promise<boolean> {
    return (await commandExists("pip")) || (await commandExists("pip3"));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const bin = (await commandExists("pip")) ? "pip" : "pip3";
    const { stdout } = await run(bin, [
      "list",
      "--outdated",
      "--user",
      "--format=json",
      "--disable-pip-version-check",
    ]);
    if (!stdout.trim()) return [];

    let parsed: PipOutdatedEntry[];
    try {
      parsed = JSON.parse(stdout) as PipOutdatedEntry[];
    } catch {
      return [];
    }

    return parsed.map<OutdatedPackage>((p) => ({
      id: p.name,
      name: p.name,
      current: p.version,
      latest: p.latest_version,
    }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const bin = (await commandExists("pip")) ? "pip" : "pip3";
    const res = await runInherit(bin, [
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      packageId,
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const bin = (await commandExists("pip")) ? "pip" : "pip3";
    const res = await runInherit(bin, [
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      ...packages.map((p) => p.id),
    ]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
