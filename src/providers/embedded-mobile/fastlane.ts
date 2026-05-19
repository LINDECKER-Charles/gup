import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface RubygemsVersionResponse {
  version?: string;
}

/**
 * Fastlane CLI. Distributed via RubyGems â€” covered by the generic `gem`
 * provider, but we keep a dedicated entry because mobile/embedded users are
 * unlikely to scan their entire gem set and fastlane's own update path
 * (`fastlane update_fastlane`) bypasses sudo prompts on system Ruby installs.
 *
 * Version source: `fastlane --version` (first line prints "fastlane <ver>",
 * subsequent lines list plugin versions which we ignore here â€” fastlane has
 * its own `fastlane update_plugins` workflow that should not be invoked from
 * the outside).
 */
export class FastlaneProvider implements Provider {
  readonly id = "fastlane";
  readonly displayName = "Fastlane";
  readonly installHint = "gem install fastlane --user-install";

  async isAvailable(): Promise<boolean> {
    return commandExists("fastlane");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("fastlane", ["--version"]);
    if (failed) return [];

    const current = parseFastlaneVersion(stdout);
    if (!current) return [];

    const latest = await fetchRubygemsLatest("fastlane");
    if (!latest || latest === current) return [];

    return [{ id: "fastlane", name: "Fastlane", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("gem", ["update", "fastlane"]);
    return { id: "fastlane", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("fastlane")];
  }
}

function parseFastlaneVersion(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^fastlane\s+v?([0-9][\w.+-]*)/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function fetchRubygemsLatest(gem: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://rubygems.org/api/v1/versions/${encodeURIComponent(gem)}/latest.json`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as RubygemsVersionResponse;
    return data.version ?? null;
  } catch {
    return null;
  }
}
