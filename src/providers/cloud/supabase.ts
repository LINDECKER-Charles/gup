import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Supabase CLI. The official Windows install path is scoop or the npm wrapper
 * (`supabase`). Native binary has no self-update on Windows, so we delegate
 * the upgrade to the detected package manager.
 *
 * `supabase --version` prints just the version, e.g. "1.180.4".
 */
export class SupabaseProvider implements Provider {
  readonly id = "supabase";
  readonly displayName = "Supabase CLI";
  readonly installHint = pickInstallHint({
    win32: "scoop install supabase",
    fallback: "brew install supabase",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("supabase");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("supabase", ["--version"]);
    if (failed) return [];

    const match = stdout.trim().match(/^v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("supabase/cli");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("supabase");
    return [
      {
        id: "supabase",
        name: "Supabase CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "supabase",
      binary: "supabase",
      packageIds: {
        scoop: "supabase",
        brew: "supabase",
      },
      manualMessage:
        "Télécharger https://github.com/supabase/cli/releases ou `npm i -g supabase`",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("supabase")];
  }
}
