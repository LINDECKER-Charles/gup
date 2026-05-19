import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * `gem outdated` prints `<name> (<current> < <latest>)` for every installed
 * gem with a newer version. Honors RubyGems' user-install vs system scope
 * based on how Ruby was installed â€” we don't override it.
 */
export class GemProvider implements Provider {
  readonly id = "gem";
  readonly displayName = "RubyGems";
  readonly installHint = "https://www.ruby-lang.org / RubyInstaller for Windows";

  async isAvailable(): Promise<boolean> {
    return commandExists("gem");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("gem", ["outdated"]);
    if (failed) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      const m = line.match(/^([\w.-]+)\s+\(([^\s<]+)\s*<\s*([^\s)]+)\)/);
      if (!m) continue;
      const [, id, current, latest] = m;
      if (!id || !current || !latest) continue;
      out.push({ id, name: id, current, latest });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("gem", ["update", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("gem", ["update"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
