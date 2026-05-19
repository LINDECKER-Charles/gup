import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * LuaRocks â€” Lua's package manager. We restrict to the `--local` tree so we
 * stay user-scope; the system tree typically needs sudo and is out of scope.
 *
 * `luarocks list --outdated --porcelain` is the parse-friendly form:
 *   "<name>\t<current>\t<latest>\t<repo>"
 */
export class LuaRocksProvider implements Provider {
  readonly id = "luarocks";
  readonly displayName = "LuaRocks";
  readonly installHint = "https://luarocks.org/";

  async isAvailable(): Promise<boolean> {
    return commandExists("luarocks");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("luarocks", [
      "--local",
      "list",
      "--outdated",
      "--porcelain",
    ]);
    if (failed) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(/\t+/);
      const [name, current, latest] = parts;
      if (!name || !current || !latest || current === latest) continue;
      out.push({ id: name, name, current, latest });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("luarocks", [
      "--local",
      "install",
      packageId,
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}
