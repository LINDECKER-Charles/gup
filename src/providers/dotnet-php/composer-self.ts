import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PackagistPackageJson {
  package?: {
    versions?: Record<string, { version_normalized?: string; version?: string }>;
  };
}

/**
 * Composer itself (the PHP package manager binary). Distinct from
 * `composer-g` which manages globally-installed Composer packages.
 *
 * `composer --version` prints:
 *   "Composer version 2.7.7 2024-06-10 22:11:12"
 *
 * Latest is fetched from packagist.org metadata (no GH API rate-limit since
 * Composer's release cadence is bursty).
 */
export class ComposerSelfProvider implements Provider {
  readonly id = "composer-self";
  readonly displayName = "Composer";
  readonly installHint = pickInstallHint({
    win32: "https://getcomposer.org/download/",
    fallback: "brew install composer",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("composer");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("composer", ["--version", "--no-ansi"]);
    if (failed) return [];

    const match = stdout.match(/Composer\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchComposerLatest();
    if (!latest || latest === current) return [];

    return [{ id: "composer-self", name: "Composer", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("composer", ["self-update", "--no-interaction"]);
    return { id: "composer-self", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("composer-self")];
  }
}

async function fetchComposerLatest(): Promise<string | null> {
  try {
    const res = await fetch("https://repo.packagist.org/p2/composer/composer.json", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PackagistPackageJson;
    const versions = Object.values(data.package?.versions ?? {});
    // Versions are listed newest-first; skip dev-* / pre-release tags.
    for (const v of versions) {
      const ver = v.version;
      if (!ver) continue;
      if (/^dev-/i.test(ver) || /(alpha|beta|RC)/i.test(ver)) continue;
      return ver.replace(/^v/, "");
    }
    return null;
  } catch {
    return null;
  }
}
