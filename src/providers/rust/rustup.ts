import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * `rustup check` lists each installed toolchain with either "Up to date" or
 * "Update available : <current> -> <latest>". Parsing is text-based since
 * rustup has no JSON output.
 */
export class RustupProvider implements Provider {
  readonly id = "rustup";
  readonly displayName = "Rustup (toolchains)";
  readonly installHint = "https://rustup.rs";

  async isAvailable(): Promise<boolean> {
    return commandExists("rustup");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("rustup", ["check"]);
    if (failed) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      // Format examples:
      //   stable-x86_64-pc-windows-msvc - Update available : 1.79.0 (...) -> 1.80.0 (...)
      //   rustup - Up to date : 1.27.1
      //   rustup - Update available : 1.27.1 -> 1.28.0
      const match = line.match(
        /^(\S+)\s+-\s+Update available\s*:\s*([^\s(]+)[^->]*->\s*([^\s(]+)/i,
      );
      if (!match) continue;
      const [, id, current, latest] = match;
      if (!id || !current || !latest) continue;
      out.push({ id, name: id, current, latest });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    // rustup self-update is a special case
    if (packageId === "rustup") {
      const res = await runInherit("rustup", ["self", "update"]);
      return { id: packageId, success: !res.failed };
    }
    const res = await runInherit("rustup", ["update", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    // `rustup update` (no arg) updates every installed toolchain AND rustup itself.
    const res = await runInherit("rustup", ["update"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
