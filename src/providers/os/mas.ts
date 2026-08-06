import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Mac App Store, through the `mas` CLI. Covers the slice of a Mac that no
 * other provider can reach: App Store apps are sandboxed installs whose
 * updates are gated behind the Store's own auth, and neither brew nor a
 * self-update path can touch them.
 *
 * Not to be confused with `softwareupdate` (macOS releases, XProtect, command
 * line tools) — OS-level updates are out of scope by the same rule that keeps
 * Windows Update out of gup.
 */
export class MasProvider implements Provider {
  readonly id = "mas";
  readonly displayName = "Mac App Store";
  readonly installHint = pickInstallHint({
    darwin: "brew install mas",
    fallback: "macOS uniquement — https://github.com/mas-cli/mas",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    return commandExists("mas");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("mas", ["outdated"]);
    if (failed) return [];
    return parseMasOutdated(stdout);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("mas", ["upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("mas", ["upgrade"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

/**
 * `mas outdated` prints one app per line:
 *
 *   497799835 Xcode (14.2 -> 14.3)
 *
 * The numeric App Store id is the update target (`mas upgrade 497799835`),
 * so it becomes the package id and the human name goes to `name`. The arrow
 * has varied across mas releases (`->`, `→`, `<`), hence the loose separator.
 */
export function parseMasOutdated(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.+?)\s+\((\S+)\s*(?:->|→|<)\s*([^\s)]+)\)$/);
    if (!m) continue;
    const [, id, name, current, latest] = m;
    if (!id || !name || !current || !latest) continue;
    out.push({ id, name, current, latest });
  }
  return out;
}
