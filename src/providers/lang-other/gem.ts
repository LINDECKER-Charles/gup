import { commandExists, run, runInherit, whichFirst } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * `gem outdated` prints `<name> (<current> < <latest>)` for every installed
 * gem with a newer version. Honors RubyGems' user-install vs system scope
 * based on how Ruby was installed — we don't override it.
 */
export class GemProvider implements Provider {
  readonly id = "gem";
  readonly displayName = "RubyGems";
  readonly installHint = pickInstallHint({
    win32: "https://www.ruby-lang.org / RubyInstaller for Windows",
    darwin: "brew install ruby, ou rbenv/asdf — le Ruby système d'Apple n'est pas gérable",
    fallback: "https://www.ruby-lang.org/fr/documentation/installation/",
  });

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("gem"))) return false;
    return !(await isAppleSystemRuby());
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

/**
 * macOS ships a frozen Ruby (2.6, deprecated by Apple) whose gems live under
 * SIP-protected system paths. `gem outdated` there reports ~40 stale stdlib
 * gems that `gem update` cannot touch: the write is refused outright, and
 * `sudo gem update` on the system Ruby is a documented way to break macOS
 * tooling. Reporting them is worse than useless — it buries the handful of
 * real, actionable updates from other providers.
 *
 * Only Apple's own interpreter is excluded. Any managed Ruby (Homebrew,
 * rbenv, rvm, asdf, chruby) resolves elsewhere and stays fully supported.
 */
export async function isAppleSystemRuby(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const gemPath = await whichFirst("gem");
  if (!gemPath) return false;
  const lower = gemPath.toLowerCase();
  return lower.startsWith("/usr/bin/") || lower.startsWith("/system/");
}
