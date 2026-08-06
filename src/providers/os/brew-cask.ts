import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

import { parseBrewOutdated } from "./brew.js";

/**
 * Homebrew casks — GUI applications and binary-only distributions installed
 * into `/Applications` (Docker Desktop, VS Code, JetBrains IDEs, browsers…).
 * Split from {@link BrewProvider} because the upgrade command differs
 * (`brew upgrade --cask`) and because casks are the noisier half: users
 * routinely want to scan formulae only, which `gup list --only brew` now
 * expresses.
 *
 * `--greedy` is intentionally omitted: without it, brew hides casks that
 * carry `auto_updates true` (Chrome, Firefox, VS Code…). Those apps update
 * themselves on launch, and forcing a cask upgrade on them re-downloads a
 * full app bundle to reach a version the app would have fetched anyway.
 */
export class BrewCaskProvider implements Provider {
  readonly id = "brew-cask";
  readonly displayName = "Homebrew (casks)";
  readonly installHint = pickInstallHint({
    win32: "Les casks Homebrew ne ciblent pas Windows — utiliser winget/scoop.",
    fallback: "https://brew.sh puis `brew install --cask <app>`",
  });

  async isAvailable(): Promise<boolean> {
    // Casks are macOS-only: `brew` exists on Linuxbrew but rejects every cask
    // command there, so probing the binary alone would surface a provider
    // that can never return anything.
    if (process.platform !== "darwin") return false;
    return commandExists("brew");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("brew", ["outdated", "--cask", "--json=v2"]);
    if (failed && !stdout) return [];
    return parseBrewOutdated(stdout, "casks");
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("brew", ["upgrade", "--cask", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("brew", ["upgrade", "--cask"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
