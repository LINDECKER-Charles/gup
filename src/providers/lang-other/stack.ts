import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Stack — Haskell's curated build tool. Self-update via `stack upgrade`.
 *
 * `stack --version` prints "Version 2.15.5, Git revision ... x86_64 hpack-...".
 */
export class StackProvider implements Provider {
  readonly id = "stack";
  readonly displayName = "Stack (Haskell)";
  readonly installHint = pickInstallHint({
    win32: "https://docs.haskellstack.org/en/stable/install_and_upgrade/",
    fallback: "brew install haskell-stack",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("stack");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("stack", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/Version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("commercialhaskell/stack");
    if (!latest || latest === current) return [];

    return [{ id: "stack", name: "Stack", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("stack", ["upgrade"]);
    return { id: "stack", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("stack")];
  }
}
